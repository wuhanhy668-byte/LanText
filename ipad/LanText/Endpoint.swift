import Foundation

enum Endpoint {
    // Restrict the unencrypted transport to explicit private/link-local IPv4 addresses.
    static func url(ip: String, port: String) -> URL? {
        let parts = ip.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return nil }
        var octets: [Int] = []
        for part in parts {
            guard !part.isEmpty, part.allSatisfy({ $0 >= "0" && $0 <= "9" }),
                  let value = Int(part), (0...255).contains(value) else { return nil }
            octets.append(value)
        }
        let local = octets[0] == 10 || (octets[0] == 172 && (16...31).contains(octets[1])) ||
            (octets[0] == 192 && octets[1] == 168) || (octets[0] == 169 && octets[1] == 254)
        guard local, let number = Int(port), (1024...65535).contains(number) else { return nil }
        let normalized = octets.map(String.init).joined(separator: ".")
        return URL(string: "http://\(normalized):\(number)/v1/text")
    }
}

struct TextSnapshot: Decodable {
    let text: String
    let revision: String
}
