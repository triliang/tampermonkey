import Foundation
import Security
let service = "com.luban.s0.test." + UUID().uuidString
let secret = UUID().uuidString.data(using: .utf8)!
let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "s0-probe"]
var add = query
add[kSecValueData as String] = secret
let status = SecItemAdd(add as CFDictionary, nil)
guard status == errSecSuccess else { print("KEYCHAIN_ADD_FAILED status=\(status)"); exit(1) }
defer { SecItemDelete(query as CFDictionary) }
var get = query
get[kSecReturnData as String] = true
var result: CFTypeRef?
let read = SecItemCopyMatching(get as CFDictionary, &result)
guard read == errSecSuccess, let data = result as? Data, data == secret else { SecItemDelete(query as CFDictionary); print("KEYCHAIN_READ_FAILED status=\(read)"); exit(1) }
let removed = SecItemDelete(query as CFDictionary)
guard removed == errSecSuccess else { print("KEYCHAIN_DELETE_FAILED status=\(removed)"); exit(1) }
print("KEYCHAIN_PROBE_PASS (temporary test item removed; no secret output)")
