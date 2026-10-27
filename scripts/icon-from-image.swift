import AppKit
import CoreGraphics

let sourceURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
guard let source = NSImage(contentsOf: sourceURL),
      let image = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fatalError("Image source must be readable")
}
try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)
let sizes = [(16, "icon_16x16"), (32, "icon_16x16@2x"), (32, "icon_32x32"),
             (64, "icon_32x32@2x"), (128, "icon_128x128"), (256, "icon_128x128@2x"),
             (256, "icon_256x256"), (512, "icon_256x256@2x"), (512, "icon_512x512"),
             (1024, "icon_512x512@2x")]
for (size, name) in sizes {
    guard let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                                  bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        fatalError("Image context creation failed")
    }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
    let representation = NSBitmapImageRep(cgImage: context.makeImage()!)
    try representation.representation(using: .png, properties: [:])!
        .write(to: outputURL.appendingPathComponent("\(name).png"))
}
