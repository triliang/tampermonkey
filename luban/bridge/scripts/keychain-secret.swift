import Foundation
import Security
// S0-only namespace. Secret travels via stdin/stdout pipes, never argv or logs.
let args = CommandLine.arguments
if args.count != 4 { fputs("KEYCHAIN_USAGE\n", stderr); exit(1) }
let operation = args[1], service = args[2], account = args[3]
if !service.hasPrefix("com.luban.s0.feishu.") || !account.hasPrefix("cli_") { fputs("KEYCHAIN_SCOPE_DENIED\n", stderr); exit(1) }
let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account]
if operation == "set" {
 let data = FileHandle.standardInput.readDataToEndOfFile()
 if data.isEmpty || data.count > 16384 { fputs("KEYCHAIN_INPUT_INVALID\n", stderr); exit(1) }
 var attributes = query; attributes[kSecValueData as String] = data
 let status = SecItemAdd(attributes as CFDictionary,nil)
 if status != errSecSuccess { fputs("KEYCHAIN_SET_FAILED status=\(status)\n",stderr);exit(1) }
} else if operation == "get" {
 var lookup=query;lookup[kSecReturnData as String]=true
 var result: CFTypeRef?
 let status=SecItemCopyMatching(lookup as CFDictionary,&result)
 if status != errSecSuccess || !(result is Data) { fputs("KEYCHAIN_GET_FAILED status=\(status)\n",stderr);exit(1) }
 FileHandle.standardOutput.write(result as! Data)
} else if operation == "delete" {
 let status=SecItemDelete(query as CFDictionary)
 if status != errSecSuccess { fputs("KEYCHAIN_DELETE_FAILED status=\(status)\n",stderr);exit(1) }
} else { fputs("KEYCHAIN_OPERATION_DENIED\n",stderr);exit(1) }
