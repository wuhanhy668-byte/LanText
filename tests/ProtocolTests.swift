import Foundation

@main struct EndpointTests {
    static func main() throws {
        for ip in ["192.168.1.5", "10.0.0.1", "172.16.0.4", "172.31.255.1", "169.254.1.2"] {
            precondition(Endpoint.url(ip: ip, port: "8765") != nil)
        }
        for ip in ["example.com", "8.8.8.8", "127.0.0.1", "192.168.1.999", "172.32.1.1", "192.168..1", "192.168.1.1/path", "::1"] {
            precondition(Endpoint.url(ip: ip, port: "8765") == nil)
        }
        for port in ["0", "1023", "65536", "hello"] { precondition(Endpoint.url(ip: "10.1.1.1", port: port) == nil) }
        let sample = try JSONDecoder().decode(TextSnapshot.self, from: Data("{\"text\":\"中文\\n第二行😀\",\"revision\":\"epoch:1\"}".utf8))
        precondition(sample.text == "中文\n第二行😀")
        print("Endpoint and UTF-8 decoding tests passed")
    }
}
