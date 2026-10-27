import AppKit
import CoreGraphics
let directory = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
let sizes = [(16,"icon_16x16"),(32,"icon_16x16@2x"),(32,"icon_32x32"),(64,"icon_32x32@2x"),
             (128,"icon_128x128"),(256,"icon_128x128@2x"),(256,"icon_256x256"),(512,"icon_256x256@2x"),
             (512,"icon_512x512"),(1024,"icon_512x512@2x")]
for (size,name) in sizes {
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.scaleBy(x: CGFloat(size)/1024, y: CGFloat(size)/1024)
    context.setFillColor(CGColor(red: 0.14, green: 0.39, blue: 0.46, alpha: 1))
    context.addPath(CGPath(roundedRect: CGRect(x: 64,y: 64,width: 896,height: 896), cornerWidth: 208,cornerHeight: 208,transform: nil))
    context.fillPath()
    context.setStrokeColor(CGColor(red: 0.55,green: 0.75,blue: 0.78,alpha: 0.35))
    context.setLineWidth(12)
    context.move(to: CGPoint(x: 240,y: 840)); context.addLine(to: CGPoint(x: 780,y: 840)); context.strokePath()
    context.setStrokeColor(CGColor(red: 0.98,green: 0.99,blue: 1,alpha: 1))
    context.setLineWidth(54); context.setLineCap(.round); context.setLineJoin(.round)
    context.move(to: CGPoint(x: 512,y: 736)); context.addLine(to: CGPoint(x: 512,y: 376)); context.strokePath()
    context.move(to: CGPoint(x: 362,y: 522)); context.addLine(to: CGPoint(x: 512,y: 372)); context.addLine(to: CGPoint(x: 662,y: 522)); context.strokePath()
    context.move(to: CGPoint(x: 286,y: 358)); context.addLine(to: CGPoint(x: 286,y: 264));
    context.addLine(to: CGPoint(x: 738,y: 264)); context.addLine(to: CGPoint(x: 738,y: 358)); context.strokePath()
    let image = NSBitmapImageRep(cgImage: context.makeImage()!)
    try image.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(directory)/\(name).png"))
}
