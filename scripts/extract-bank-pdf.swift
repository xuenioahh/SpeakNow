import Foundation
import PDFKit
import AppKit

let path = CommandLine.arguments[1]
guard let document = PDFDocument(url: URL(fileURLWithPath: path)) else { fatalError("Cannot open PDF") }
var pages: [String] = []
for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else { continue }
    pages.append(page.string ?? "")
    if CommandLine.arguments.count > 2 && index == (CommandLine.arguments.count > 3 ? Int(CommandLine.arguments[3]) ?? 0 : 0) {
        let thumbnail = page.thumbnail(of: NSSize(width: 1000, height: 1400), for: .mediaBox)
        if let tiff = thumbnail.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
            try png.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
        }
    }
}
let data = try JSONSerialization.data(withJSONObject: pages, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
