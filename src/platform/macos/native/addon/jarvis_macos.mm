/**
 * jarvis_macos — Phase 13 optional N-API addon (darwin only).
 *
 * Uses AppKit/NSWorkspace, CoreGraphics window/display APIs, ImageIO for PNG,
 * and IOKit HIDIdleTime for aggregate idle. No shell, no AppleScript, no force-kill,
 * no CGEvent injection, no camera/microphone.
 */
#include <node_api.h>
#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>
#import <IOKit/IOKitLib.h>
#import <ApplicationServices/ApplicationServices.h>

#include <string.h>
#include <stdlib.h>
#include <stdio.h>

/* Private but widely used session dictionary accessor — may return null fields. */
extern CFDictionaryRef CGSessionCopyCurrentDictionary(void);

static napi_value OkTrue(napi_env env) {
  napi_value obj, ok;
  napi_create_object(env, &obj);
  napi_get_boolean(env, true, &ok);
  napi_set_named_property(env, obj, "ok", ok);
  return obj;
}

static napi_value OkFalse(napi_env env, const char* code, const char* message) {
  napi_value obj, ok, c, m;
  napi_create_object(env, &obj);
  napi_get_boolean(env, false, &ok);
  napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &c);
  napi_create_string_utf8(env, message, NAPI_AUTO_LENGTH, &m);
  napi_set_named_property(env, obj, "ok", ok);
  napi_set_named_property(env, obj, "code", c);
  napi_set_named_property(env, obj, "message", m);
  return obj;
}

static bool GetUtf8Arg(napi_env env, napi_value v, char* buf, size_t buflen) {
  napi_valuetype t;
  napi_typeof(env, v, &t);
  if (t == napi_null || t == napi_undefined) {
    buf[0] = '\0';
    return false;
  }
  size_t written = 0;
  napi_status s = napi_get_value_string_utf8(env, v, buf, buflen, &written);
  return s == napi_ok && written > 0;
}

static napi_value AppToObject(napi_env env, NSRunningApplication* app) {
  napi_value obj;
  napi_create_object(env, &obj);
  NSString* name = app.localizedName ?: app.bundleIdentifier ?: @"unknown";
  NSString* bundle = app.bundleIdentifier;
  NSURL* url = app.bundleURL;
  napi_value n, b, p, r;
  napi_create_string_utf8(env, name.UTF8String, NAPI_AUTO_LENGTH, &n);
  napi_set_named_property(env, obj, "name", n);
  if (bundle) {
    napi_create_string_utf8(env, bundle.UTF8String, NAPI_AUTO_LENGTH, &b);
  } else {
    napi_get_null(env, &b);
  }
  napi_set_named_property(env, obj, "bundleId", b);
  if (url) {
    napi_create_string_utf8(env, url.path.UTF8String, NAPI_AUTO_LENGTH, &p);
  } else {
    napi_get_null(env, &p);
  }
  napi_set_named_property(env, obj, "path", p);
  napi_get_boolean(env, true, &r);
  napi_set_named_property(env, obj, "running", r);
  return obj;
}

static NSRunningApplication* FindRunning(const char* bundleId, const char* path) {
  NSArray<NSRunningApplication*>* apps =
      [NSWorkspace sharedWorkspace].runningApplications;
  if (bundleId && bundleId[0] != '\0') {
    NSString* bid = [NSString stringWithUTF8String:bundleId];
    for (NSRunningApplication* app in apps) {
      if (app.bundleIdentifier && [app.bundleIdentifier isEqualToString:bid]) {
        return app;
      }
    }
  }
  if (path && path[0] != '\0') {
    NSString* p = [NSString stringWithUTF8String:path];
    for (NSRunningApplication* app in apps) {
      if (app.bundleURL && [app.bundleURL.path isEqualToString:p]) {
        return app;
      }
    }
  }
  return nil;
}

static napi_value ListRunningApplications(napi_env env, napi_callback_info info) {
  (void)info;
  @autoreleasepool {
    napi_value arr;
    napi_create_array(env, &arr);
    NSArray<NSRunningApplication*>* apps =
        [NSWorkspace sharedWorkspace].runningApplications;
    uint32_t i = 0;
    for (NSRunningApplication* app in apps) {
      if (app.activationPolicy != NSApplicationActivationPolicyRegular) {
        continue;
      }
      napi_set_element(env, arr, i++, AppToObject(env, app));
    }
    return arr;
  }
}

static napi_value GetFrontmostApplication(napi_env env, napi_callback_info info) {
  (void)info;
  @autoreleasepool {
    NSRunningApplication* front =
        [NSWorkspace sharedWorkspace].frontmostApplication;
    if (!front) {
      napi_value n;
      napi_get_null(env, &n);
      return n;
    }
    return AppToObject(env, front);
  }
}

static napi_value OpenApplication(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  char bundleId[512] = {0};
  char path[1024] = {0};
  if (argc > 0) GetUtf8Arg(env, args[0], bundleId, sizeof(bundleId));
  if (argc > 1) GetUtf8Arg(env, args[1], path, sizeof(path));

  @autoreleasepool {
    NSWorkspace* ws = [NSWorkspace sharedWorkspace];
    NSError* error = nil;
    BOOL ok = NO;
    if (bundleId[0] != '\0') {
      NSURL* url = [ws URLForApplicationWithBundleIdentifier:
                           [NSString stringWithUTF8String:bundleId]];
      if (!url) {
        return OkFalse(env, "NOT_FOUND", "Application bundleId not found");
      }
      NSWorkspaceOpenConfiguration* cfg =
          [NSWorkspaceOpenConfiguration configuration];
      cfg.activates = YES;
      dispatch_semaphore_t sem = dispatch_semaphore_create(0);
      __block BOOL opened = NO;
      __block NSError* openErr = nil;
      [ws openApplicationAtURL:url
                 configuration:cfg
             completionHandler:^(NSRunningApplication* _Nullable app,
                                 NSError* _Nullable err) {
               opened = (app != nil && err == nil);
               openErr = err;
               dispatch_semaphore_signal(sem);
             }];
      dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 15 * NSEC_PER_SEC));
      ok = opened;
      error = openErr;
    } else if (path[0] != '\0') {
      NSString* p = [NSString stringWithUTF8String:path];
      if (![p hasSuffix:@".app"]) {
        return OkFalse(env, "INVALID_IDENTITY", "path must be a .app bundle");
      }
      NSURL* url = [NSURL fileURLWithPath:p];
      NSWorkspaceOpenConfiguration* cfg =
          [NSWorkspaceOpenConfiguration configuration];
      dispatch_semaphore_t sem = dispatch_semaphore_create(0);
      __block BOOL opened = NO;
      __block NSError* openErr = nil;
      [ws openApplicationAtURL:url
                 configuration:cfg
             completionHandler:^(NSRunningApplication* _Nullable app,
                                 NSError* _Nullable err) {
               opened = (app != nil && err == nil);
               openErr = err;
               dispatch_semaphore_signal(sem);
             }];
      dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 15 * NSEC_PER_SEC));
      ok = opened;
      error = openErr;
    } else {
      return OkFalse(env, "INVALID_IDENTITY", "bundleId or path required");
    }
    if (!ok) {
      const char* msg =
          error ? error.localizedDescription.UTF8String : "Failed to open application";
      return OkFalse(env, "NATIVE_ERROR", msg);
    }
    return OkTrue(env);
  }
}

static napi_value TerminateApplicationGracefully(napi_env env,
                                                 napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  char bundleId[512] = {0};
  char path[1024] = {0};
  if (argc > 0) GetUtf8Arg(env, args[0], bundleId, sizeof(bundleId));
  if (argc > 1) GetUtf8Arg(env, args[1], path, sizeof(path));

  @autoreleasepool {
    NSRunningApplication* app = FindRunning(bundleId, path);
    if (!app) {
      return OkFalse(env, "APPLICATION_NOT_RUNNING", "Application is not running");
    }
    // Graceful terminate only — never forceTerminate.
    BOOL ok = [app terminate];
    if (!ok) {
      return OkFalse(env, "NATIVE_ERROR", "Graceful terminate was not accepted");
    }
    return OkTrue(env);
  }
}

static napi_value IsApplicationRunning(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  char bundleId[512] = {0};
  char path[1024] = {0};
  if (argc > 0) GetUtf8Arg(env, args[0], bundleId, sizeof(bundleId));
  if (argc > 1) GetUtf8Arg(env, args[1], path, sizeof(path));
  @autoreleasepool {
    NSRunningApplication* app = FindRunning(bundleId, path);
    napi_value out;
    napi_get_boolean(env, app != nil, &out);
    return out;
  }
}

/** Aggregate HID idle seconds via IOKit (no input interception). */
static napi_value GetIdleTimeSeconds(napi_env env, napi_callback_info info) {
  (void)info;
  double seconds = -1;
  io_service_t service = IOServiceGetMatchingService(
      kIOMainPortDefault, IOServiceMatching("IOHIDSystem"));
  if (service) {
    CFTypeRef prop = IORegistryEntryCreateCFProperty(
        service, CFSTR("HIDIdleTime"), kCFAllocatorDefault, 0);
    IOObjectRelease(service);
    if (prop) {
      int64_t nanoseconds = 0;
      if (CFGetTypeID(prop) == CFNumberGetTypeID()) {
        CFNumberGetValue((CFNumberRef)prop, kCFNumberSInt64Type, &nanoseconds);
        seconds = (double)nanoseconds / 1000000000.0;
      }
      CFRelease(prop);
    }
  }
  napi_value out;
  if (seconds < 0) {
    napi_throw_error(env, "NATIVE_ERROR", "Unable to read HIDIdleTime");
    return nullptr;
  }
  napi_create_double(env, seconds, &out);
  return out;
}

static napi_value GetDisplays(napi_env env, napi_callback_info info) {
  (void)info;
  @autoreleasepool {
    napi_value arr;
    napi_create_array(env, &arr);
    NSArray<NSScreen*>* screens = [NSScreen screens];
    NSScreen* main = [NSScreen mainScreen];
    uint32_t i = 0;
    for (NSScreen* screen in screens) {
      NSRect frame = screen.frame;
      CGFloat scale = screen.backingScaleFactor;
      napi_value obj, id, w, h, s, primary, bounds;
      napi_create_object(env, &obj);
      NSString* sid = [NSString stringWithFormat:@"display-%u", i];
      napi_create_string_utf8(env, sid.UTF8String, NAPI_AUTO_LENGTH, &id);
      napi_create_int32(env, (int32_t)frame.size.width, &w);
      napi_create_int32(env, (int32_t)frame.size.height, &h);
      napi_create_double(env, (double)scale, &s);
      napi_get_boolean(env, screen == main, &primary);
      napi_create_object(env, &bounds);
      napi_value bx, by, bw, bh;
      napi_create_double(env, frame.origin.x, &bx);
      napi_create_double(env, frame.origin.y, &by);
      napi_create_double(env, frame.size.width, &bw);
      napi_create_double(env, frame.size.height, &bh);
      napi_set_named_property(env, bounds, "x", bx);
      napi_set_named_property(env, bounds, "y", by);
      napi_set_named_property(env, bounds, "width", bw);
      napi_set_named_property(env, bounds, "height", bh);
      napi_set_named_property(env, obj, "id", id);
      napi_set_named_property(env, obj, "width", w);
      napi_set_named_property(env, obj, "height", h);
      napi_set_named_property(env, obj, "scaleFactor", s);
      napi_set_named_property(env, obj, "isPrimary", primary);
      napi_set_named_property(env, obj, "bounds", bounds);
      napi_set_element(env, arr, i++, obj);
    }
    return arr;
  }
}

static napi_value WindowDictToObject(napi_env env, CFDictionaryRef dict) {
  napi_value obj;
  napi_create_object(env, &obj);

  CFNumberRef num = (CFNumberRef)CFDictionaryGetValue(dict, kCGWindowNumber);
  int64_t wid = 0;
  if (num) CFNumberGetValue(num, kCFNumberSInt64Type, &wid);
  char idbuf[64];
  snprintf(idbuf, sizeof(idbuf), "%lld", (long long)wid);
  napi_value idv;
  napi_create_string_utf8(env, idbuf, NAPI_AUTO_LENGTH, &idv);
  napi_set_named_property(env, obj, "id", idv);

  auto setStr = [&](CFStringRef key, const char* prop) {
    CFStringRef s = (CFStringRef)CFDictionaryGetValue(dict, key);
    napi_value v;
    if (s) {
      char buf[1024];
      if (CFStringGetCString(s, buf, sizeof(buf), kCFStringEncodingUTF8)) {
        napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &v);
      } else {
        napi_get_null(env, &v);
      }
    } else {
      napi_get_null(env, &v);
    }
    napi_set_named_property(env, obj, prop, v);
  };
  setStr(kCGWindowName, "title");
  setStr(kCGWindowOwnerName, "applicationName");

  // bundleId not always in window dict — leave null unless we can map owner PID.
  napi_value nullv;
  napi_get_null(env, &nullv);
  napi_set_named_property(env, obj, "bundleId", nullv);

  CFDictionaryRef bounds =
      (CFDictionaryRef)CFDictionaryGetValue(dict, kCGWindowBounds);
  if (bounds) {
    CGRect rect;
    if (CGRectMakeWithDictionaryRepresentation(bounds, &rect)) {
      napi_value bobj, x, y, w, h;
      napi_create_object(env, &bobj);
      napi_create_double(env, rect.origin.x, &x);
      napi_create_double(env, rect.origin.y, &y);
      napi_create_double(env, rect.size.width, &w);
      napi_create_double(env, rect.size.height, &h);
      napi_set_named_property(env, bobj, "x", x);
      napi_set_named_property(env, bobj, "y", y);
      napi_set_named_property(env, bobj, "width", w);
      napi_set_named_property(env, bobj, "height", h);
      napi_set_named_property(env, obj, "bounds", bobj);
    }
  }

  CFBooleanRef onscreen =
      (CFBooleanRef)CFDictionaryGetValue(dict, kCGWindowIsOnscreen);
  napi_value visible;
  napi_get_boolean(env, onscreen ? CFBooleanGetValue(onscreen) : false, &visible);
  napi_set_named_property(env, obj, "visible", visible);

  napi_value minimized;
  napi_get_null(env, &minimized);
  napi_set_named_property(env, obj, "minimized", minimized);

  napi_value active;
  napi_get_null(env, &active);
  napi_set_named_property(env, obj, "active", active);

  return obj;
}

static napi_value GetWindows(napi_env env, napi_callback_info info) {
  (void)info;
  CFArrayRef windowList = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID);
  napi_value arr;
  napi_create_array(env, &arr);
  if (!windowList) return arr;
  CFIndex count = CFArrayGetCount(windowList);
  uint32_t i = 0;
  for (CFIndex idx = 0; idx < count; idx++) {
    CFDictionaryRef dict =
        (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, idx);
    // Skip layers that are not normal windows (layer 0)
    CFNumberRef layerNum =
        (CFNumberRef)CFDictionaryGetValue(dict, kCGWindowLayer);
    int layer = 0;
    if (layerNum) CFNumberGetValue(layerNum, kCFNumberIntType, &layer);
    if (layer != 0) continue;
    napi_set_element(env, arr, i++, WindowDictToObject(env, dict));
  }
  CFRelease(windowList);
  return arr;
}

static napi_value GetActiveWindow(napi_env env, napi_callback_info info) {
  (void)info;
  CFArrayRef windowList = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID);
  if (!windowList) {
    napi_value n;
    napi_get_null(env, &n);
    return n;
  }
  CFIndex count = CFArrayGetCount(windowList);
  napi_value result = nullptr;
  for (CFIndex idx = 0; idx < count; idx++) {
    CFDictionaryRef dict =
        (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, idx);
    CFNumberRef layerNum =
        (CFNumberRef)CFDictionaryGetValue(dict, kCGWindowLayer);
    int layer = 0;
    if (layerNum) CFNumberGetValue(layerNum, kCFNumberIntType, &layer);
    if (layer != 0) continue;
    result = WindowDictToObject(env, dict);
    napi_value active;
    napi_get_boolean(env, true, &active);
    napi_set_named_property(env, result, "active", active);
    break;
  }
  CFRelease(windowList);
  if (!result) {
    napi_value n;
    napi_get_null(env, &n);
    return n;
  }
  return result;
}

static napi_value GetSessionInfo(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value obj, locked, userPresent;
  napi_create_object(env, &obj);

  Boolean isLocked = false;
  Boolean haveLocked = false;
  CFDictionaryRef session = CGSessionCopyCurrentDictionary();
  if (session) {
    CFBooleanRef lockedRef =
        (CFBooleanRef)CFDictionaryGetValue(session, CFSTR("CGSSessionScreenIsLocked"));
    if (lockedRef) {
      isLocked = CFBooleanGetValue(lockedRef);
      haveLocked = true;
    }
    CFRelease(session);
  }
  if (haveLocked) {
    napi_get_boolean(env, isLocked, &locked);
  } else {
    napi_get_null(env, &locked);
  }
  // Do not invent physical presence from idle/lock.
  napi_get_null(env, &userPresent);
  napi_set_named_property(env, obj, "locked", locked);
  napi_set_named_property(env, obj, "userPresent", userPresent);
  return obj;
}

static NSData* EncodePNG(CGImageRef image) {
  if (!image) return nil;
  NSMutableData* data = [NSMutableData data];
  CGImageDestinationRef dest = CGImageDestinationCreateWithData(
      (__bridge CFMutableDataRef)data, CFSTR("public.png"), 1, nullptr);
  if (!dest) return nil;
  CGImageDestinationAddImage(dest, image, nullptr);
  if (!CGImageDestinationFinalize(dest)) {
    CFRelease(dest);
    return nil;
  }
  CFRelease(dest);
  return data;
}

static napi_value GetMouseLocation(napi_env env, napi_callback_info info) {
  (void)info;
  @autoreleasepool {
    NSPoint loc = [NSEvent mouseLocation];
    napi_value obj, x, y, space;
    napi_create_object(env, &obj);
    napi_create_double(env, (double)loc.x, &x);
    napi_create_double(env, (double)loc.y, &y);
    napi_create_string_utf8(
        env, "cocoa-global-bottom-left", NAPI_AUTO_LENGTH, &space);
    napi_set_named_property(env, obj, "x", x);
    napi_set_named_property(env, obj, "y", y);
    napi_set_named_property(env, obj, "coordinateSpace", space);
    return obj;
  }
}

static void SetWindowFieldFromAXString(
    napi_env env,
    napi_value obj,
    const char* key,
    CFStringRef attr,
    AXUIElementRef el) {
  CFTypeRef value = NULL;
  if (AXUIElementCopyAttributeValue(el, attr, &value) != kAXErrorSuccess ||
      !value) {
    napi_value n;
    napi_get_null(env, &n);
    napi_set_named_property(env, obj, key, n);
    return;
  }
  if (CFGetTypeID(value) == CFStringGetTypeID()) {
    napi_value s;
    napi_create_string_utf8(
        env, [(__bridge NSString*)value UTF8String], NAPI_AUTO_LENGTH, &s);
    napi_set_named_property(env, obj, key, s);
  } else {
    napi_value n;
    napi_get_null(env, &n);
    napi_set_named_property(env, obj, key, n);
  }
  CFRelease(value);
}

static napi_value GetFocusedWindowInfo(napi_env env, napi_callback_info info) {
  (void)info;
  @autoreleasepool {
    napi_value result;
    napi_create_object(env, &result);

    NSRunningApplication* front =
        [NSWorkspace sharedWorkspace].frontmostApplication;
    if (!front) {
      napi_value ok, code;
      napi_get_boolean(env, false, &ok);
      napi_create_string_utf8(env, "UNAVAILABLE", NAPI_AUTO_LENGTH, &code);
      napi_set_named_property(env, result, "ok", ok);
      napi_set_named_property(env, result, "code", code);
      return result;
    }

    pid_t pid = front.processIdentifier;
    AXUIElementRef app = AXUIElementCreateApplication(pid);
    if (!app) {
      napi_value ok, code;
      napi_get_boolean(env, false, &ok);
      napi_create_string_utf8(env, "UNAVAILABLE", NAPI_AUTO_LENGTH, &code);
      napi_set_named_property(env, result, "ok", ok);
      napi_set_named_property(env, result, "code", code);
      return result;
    }

    CFTypeRef windowRef = NULL;
    AXError err =
        AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute, &windowRef);
    CFRelease(app);

    if (err == kAXErrorAPIDisabled || err == kAXErrorNotAuthorized) {
      napi_value ok, code;
      napi_get_boolean(env, false, &ok);
      napi_create_string_utf8(
          env, "PERMISSION_REQUIRED", NAPI_AUTO_LENGTH, &code);
      napi_set_named_property(env, result, "ok", ok);
      napi_set_named_property(env, result, "code", code);
      return result;
    }

    if (err != kAXErrorSuccess || !windowRef) {
      napi_value ok, code;
      napi_get_boolean(env, false, &ok);
      napi_create_string_utf8(env, "UNAVAILABLE", NAPI_AUTO_LENGTH, &code);
      napi_set_named_property(env, result, "ok", ok);
      napi_set_named_property(env, result, "code", code);
      return result;
    }

    AXUIElementRef window = (AXUIElementRef)windowRef;
    napi_value ok, windowObj, appName, bundleId;
    napi_get_boolean(env, true, &ok);
    napi_set_named_property(env, result, "ok", ok);
    napi_create_object(env, &windowObj);

    NSString* name = front.localizedName ?: front.bundleIdentifier;
    if (name) {
      napi_create_string_utf8(env, name.UTF8String, NAPI_AUTO_LENGTH, &appName);
    } else {
      napi_get_null(env, &appName);
    }
    napi_set_named_property(env, windowObj, "applicationName", appName);

    if (front.bundleIdentifier) {
      napi_create_string_utf8(
          env, front.bundleIdentifier.UTF8String, NAPI_AUTO_LENGTH, &bundleId);
    } else {
      napi_get_null(env, &bundleId);
    }
    napi_set_named_property(env, windowObj, "bundleId", bundleId);

    SetWindowFieldFromAXString(
        env, windowObj, "title", kAXTitleAttribute, window);
    SetWindowFieldFromAXString(
        env, windowObj, "role", kAXRoleAttribute, window);

    napi_value boundsObj;
    napi_create_object(env, &boundsObj);
    CFTypeRef posRef = NULL;
    CFTypeRef sizeRef = NULL;
    if (AXUIElementCopyAttributeValue(window, kAXPositionAttribute, &posRef) ==
            kAXErrorSuccess &&
        posRef &&
        AXUIElementCopyAttributeValue(window, kAXSizeAttribute, &sizeRef) ==
            kAXErrorSuccess &&
        sizeRef) {
      CGPoint pos = CGPointZero;
      CGSize size = CGSizeZero;
      AXValueGetValue((AXValueRef)posRef, (AXValueType)kAXValueCGPointType, &pos);
      AXValueGetValue((AXValueRef)sizeRef, (AXValueType)kAXValueCGSizeType, &size);
      napi_value bx, by, bw, bh;
      napi_create_double(env, pos.x, &bx);
      napi_create_double(env, pos.y, &by);
      napi_create_double(env, size.width, &bw);
      napi_create_double(env, size.height, &bh);
      napi_set_named_property(env, boundsObj, "x", bx);
      napi_set_named_property(env, boundsObj, "y", by);
      napi_set_named_property(env, boundsObj, "width", bw);
      napi_set_named_property(env, boundsObj, "height", bh);
      napi_set_named_property(env, windowObj, "bounds", boundsObj);
    } else {
      napi_value n;
      napi_get_null(env, &n);
      napi_set_named_property(env, windowObj, "bounds", n);
    }
    if (posRef) CFRelease(posRef);
    if (sizeRef) CFRelease(sizeRef);

    napi_set_named_property(env, result, "window", windowObj);
    CFRelease(windowRef);
    return result;
  }
}

static napi_value CaptureDisplay(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  @autoreleasepool {
    CGDirectDisplayID displayId = CGMainDisplayID();
    (void)argc;
    (void)args;

    CGImageRef image = CGDisplayCreateImage(displayId);
    if (!image) {
      napi_throw_error(
          env,
          "PERMISSION_REQUIRED",
          "Screen capture failed — Screen Recording permission may be required");
      return nullptr;
    }
    size_t width = CGImageGetWidth(image);
    size_t height = CGImageGetHeight(image);
    NSData* png = EncodePNG(image);
    CGImageRelease(image);
    if (!png) {
      napi_throw_error(env, "NATIVE_ERROR", "Failed to encode PNG");
      return nullptr;
    }

    void* buffer = nullptr;
    napi_value ab;
    napi_create_arraybuffer(env, png.length, &buffer, &ab);
    memcpy(buffer, png.bytes, png.length);
    napi_value data;
    napi_create_typedarray(env, napi_uint8_array, png.length, ab, 0, &data);

    napi_value obj, format, w, h, display;
    napi_create_object(env, &obj);
    napi_create_string_utf8(env, "png", NAPI_AUTO_LENGTH, &format);
    napi_create_int32(env, (int32_t)width, &w);
    napi_create_int32(env, (int32_t)height, &h);
    napi_create_string_utf8(env, "display-0", NAPI_AUTO_LENGTH, &display);
    napi_set_named_property(env, obj, "format", format);
    napi_set_named_property(env, obj, "width", w);
    napi_set_named_property(env, obj, "height", h);
    napi_set_named_property(env, obj, "data", data);
    napi_set_named_property(env, obj, "displayId", display);
    return obj;
  }
}

static napi_value IsNativeAvailable(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value out;
  napi_get_boolean(env, true, &out);
  return out;
}

static napi_value Init(napi_env env, napi_value exports) {
  struct {
    const char* name;
    napi_callback cb;
  } fns[] = {
      {"isNativeAvailable", IsNativeAvailable},
      {"listRunningApplications", ListRunningApplications},
      {"getFrontmostApplication", GetFrontmostApplication},
      {"openApplication", OpenApplication},
      {"terminateApplicationGracefully", TerminateApplicationGracefully},
      {"isApplicationRunning", IsApplicationRunning},
      {"getIdleTimeSeconds", GetIdleTimeSeconds},
      {"getDisplays", GetDisplays},
      {"getWindows", GetWindows},
      {"getActiveWindow", GetActiveWindow},
      {"getSessionInfo", GetSessionInfo},
      {"getMouseLocation", GetMouseLocation},
      {"getFocusedWindowInfo", GetFocusedWindowInfo},
      {"captureDisplay", CaptureDisplay},
  };
  for (size_t i = 0; i < sizeof(fns) / sizeof(fns[0]); i++) {
    napi_value fn;
    napi_create_function(env, fns[i].name, NAPI_AUTO_LENGTH, fns[i].cb, nullptr,
                         &fn);
    napi_set_named_property(env, exports, fns[i].name, fn);
  }
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
