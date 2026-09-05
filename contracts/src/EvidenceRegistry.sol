// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EvidenceRegistry {
    struct Evidence {
        bytes32 evidenceHash;
        bytes32 imageHash;
        bytes32 metadataHash;
        string sourceUrl;
        uint256 timestamp;
        address uploader;
    }

    uint256 public evidenceCount;
    mapping(uint256 => Evidence) public evidences;

    event EvidenceRegistered(
        uint256 indexed id,
        bytes32 indexed evidenceHash,
        bytes32 imageHash,
        bytes32 metadataHash,
        string sourceUrl,
        uint256 timestamp,
        address uploader
    );

    function registerEvidence(
        bytes32 evidenceHash,
        bytes32 imageHash,
        bytes32 metadataHash,
        string calldata sourceUrl
    ) external returns (uint256 id) {
        id = evidenceCount++;

        evidences[id] = Evidence({
            evidenceHash: evidenceHash,
            imageHash: imageHash,
            metadataHash: metadataHash,
            sourceUrl: sourceUrl,
            timestamp: block.timestamp,
            uploader: msg.sender
        });

        emit EvidenceRegistered(
            id,
            evidenceHash,
            imageHash,
            metadataHash,
            sourceUrl,
            block.timestamp,
            msg.sender
        );
    }

    function getEvidence(uint256 id)
        external
        view
        returns (
            bytes32 evidenceHash,
            bytes32 imageHash,
            bytes32 metadataHash,
            string memory sourceUrl,
            uint256 timestamp,
            address uploader
        )
    {
        Evidence memory e = evidences[id];
        return (
            e.evidenceHash,
            e.imageHash,
            e.metadataHash,
            e.sourceUrl,
            e.timestamp,
            e.uploader
        );
    }
}
