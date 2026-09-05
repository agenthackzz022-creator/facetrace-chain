import os
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

ABI = [
    {
        "inputs": [
            {"internalType": "bytes32", "name": "evidenceHash", "type": "bytes32"},
            {"internalType": "bytes32", "name": "imageHash", "type": "bytes32"},
            {"internalType": "bytes32", "name": "metadataHash", "type": "bytes32"},
            {"internalType": "string", "name": "sourceUrl", "type": "string"}
        ],
        "name": "registerEvidence",
        "outputs": [{"internalType": "uint256", "name": "id", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "id", "type": "uint256"}],
        "name": "getEvidence",
        "outputs": [
            {"internalType": "bytes32", "name": "evidenceHash", "type": "bytes32"},
            {"internalType": "bytes32", "name": "imageHash", "type": "bytes32"},
            {"internalType": "bytes32", "name": "metadataHash", "type": "bytes32"},
            {"internalType": "string", "name": "sourceUrl", "type": "string"},
            {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
            {"internalType": "address", "name": "uploader", "type": "address"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "evidenceCount",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "uint256", "name": "id", "type": "uint256"},
            {"indexed": True, "internalType": "bytes32", "name": "evidenceHash", "type": "bytes32"},
            {"indexed": False, "internalType": "bytes32", "name": "imageHash", "type": "bytes32"},
            {"indexed": False, "internalType": "bytes32", "name": "metadataHash", "type": "bytes32"},
            {"indexed": False, "internalType": "string", "name": "sourceUrl", "type": "string"},
            {"indexed": False, "internalType": "uint256", "name": "timestamp", "type": "uint256"},
            {"indexed": False, "internalType": "address", "name": "uploader", "type": "address"}
        ],
        "name": "EvidenceRegistered",
        "type": "event"
    }
]

class BlockchainClient:
    def __init__(self):
        rpc = os.getenv("ANVIL_RPC", "http://127.0.0.1:8545")
        address = os.getenv("CONTRACT_ADDRESS")
        private_key = os.getenv("PRIVATE_KEY")

        if not address:
            raise RuntimeError("CONTRACT_ADDRESS missing in backend/.env")
        if not private_key:
            raise RuntimeError("PRIVATE_KEY missing in backend/.env")

        self.w3 = Web3(Web3.HTTPProvider(rpc))
        if not self.w3.is_connected():
            raise RuntimeError("Cannot connect to Anvil")

        self.account = self.w3.eth.account.from_key(private_key)
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=ABI,
        )

        code = self.w3.eth.get_code(self.contract.address)
        if not code or code == b"\x00":
            raise RuntimeError(
                f"No contract code found at {self.contract.address}. "
                "Anvil may have been restarted; redeploy and update CONTRACT_ADDRESS."
            )

    @staticmethod
    def b32(hex_hash: str):
        return bytes.fromhex(hex_hash)

    def register(self, evidence_hash, image_hash, metadata_hash, source_url):
        nonce = self.w3.eth.get_transaction_count(self.account.address)
        tx = self.contract.functions.registerEvidence(
            self.b32(evidence_hash),
            self.b32(image_hash),
            self.b32(metadata_hash),
            source_url or "",
        ).build_transaction({
            "from": self.account.address,
            "nonce": nonce,
            "gas": 700000,
            "gasPrice": self.w3.eth.gas_price,
        })

        signed = self.w3.eth.account.sign_transaction(
            tx, private_key=os.getenv("PRIVATE_KEY")
        )
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

        logs = self.contract.events.EvidenceRegistered().process_receipt(receipt)
        evidence_id = int(logs[0]["args"]["id"]) if logs else None

        if evidence_id is None:
            evidence_id = int(self.contract.functions.evidenceCount().call()) - 1

        return {
            "transaction_hash": tx_hash.hex(),
            "block_number": receipt.blockNumber,
            "evidence_id": evidence_id,
            "contract_address": self.contract.address,
        }

    def get(self, evidence_id: int):
        data = self.contract.functions.getEvidence(evidence_id).call()
        return {
            "evidence_hash": data[0].hex(),
            "image_hash": data[1].hex(),
            "metadata_hash": data[2].hex(),
            "source_url": data[3],
            "timestamp": int(data[4]),
            "uploader": data[5],
        }
