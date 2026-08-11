{
  "targets": [
    {
      "target_name": "jarvis_macos",
      "sources": [
        "src/platform/macos/native/addon/jarvis_macos.mm"
      ],
      "include_dirs": [
        "src/platform/macos/native/addon"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "MACOSX_DEPLOYMENT_TARGET": "12.0",
        "OTHER_CFLAGS": [
          "-fobjc-arc"
        ],
        "OTHER_LDFLAGS": [
          "-framework AppKit",
          "-framework Foundation",
          "-framework CoreGraphics",
          "-framework ImageIO",
          "-framework IOKit",
          "-framework ApplicationServices"
        ]
      },
      "conditions": [
        [
          "OS==\"mac\"",
          {
            "sources": [
              "src/platform/macos/native/addon/jarvis_macos.mm"
            ]
          }
        ]
      ]
    }
  ]
}
