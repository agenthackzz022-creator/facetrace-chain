// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {EvidenceRegistry} from "../src/EvidenceRegistry.sol";

contract Deploy is Script {
    function run() external returns (EvidenceRegistry registry) {
        vm.startBroadcast();
        registry = new EvidenceRegistry();
        vm.stopBroadcast();
    }
}
