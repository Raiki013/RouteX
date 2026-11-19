
import { install } from "react-native-quick-crypto";

// Install native WebCrypto support
install();

console.log(
  "WebCrypto available:",
  !!globalThis.crypto?.subtle?.digest
);
