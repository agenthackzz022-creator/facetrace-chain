# FaceTrace Chain

**HH Goa 2026 · Task #3 — Face ID + Blockchain Verification**

FaceTrace Chain is an end-to-end prototype that connects **face detection**, **live reverse-image search**, **face similarity analysis**, and **blockchain evidence verification**.

The goal is simple:

> **Upload an image → find real web matches → compare available faces → create an evidence fingerprint → record it on blockchain → verify it.**

---

## 1. What the project does

```text
Image Upload
     ↓
Face Detection & Encoding
     ↓
Live Reverse-Image Search
     ↓
Public Web Results
     ↓
Candidate Face Comparison
     ↓
SHA-256 Evidence Fingerprint
     ↓
Blockchain Registration
     ↓
On-Chain Verification
```

### Main features

- Detects faces from an uploaded image using **InsightFace**.
- Generates face embeddings for detected faces.
- Uses **SerpApi + Google Lens** for genuine reverse-image search.
- Does **not** use hardcoded search results.
- Retrieves exact and visual web matches.
- Attempts face comparison on returned candidate images.
- Shows a similarity score only when a candidate was successfully face-processed.
- Creates SHA-256 fingerprints for image/evidence integrity.
- Records evidence on a **Solidity smart contract** running on **Foundry Anvil**.
- Reads the blockchain record back and verifies the hashes.
- Provides a professional React UI with a face-scanning animation and verification status.

> **Similarity is not identity proof.** It is a model-based comparison between processed face embeddings.

---

# 2. Technology Stack

| Component | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Python + FastAPI |
| Face AI | InsightFace |
| AI Runtime | ONNX Runtime |
| Image Processing | OpenCV + Pillow |
| Reverse Search | SerpApi + Google Lens |
| Blockchain | Solidity |
| Local Blockchain | Foundry Anvil |
| Blockchain Client | Web3.py |
| Integrity | SHA-256 |

---

# 3. Project Structure

```text
facetrace-chain/
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── face/
│   │   ├── search/
│   │   ├── blockchain/
│   │   └── utils/
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                 # local only - do not commit
│
├── contracts/
│   ├── foundry.toml
│   ├── src/
│   │   └── EvidenceRegistry.sol
│   └── script/
│       └── Deploy.s.sol
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
│
├── .gitignore
└── README.md
```

---

# 4. Requirements

Install:

- **Python 3.10+**
- **Node.js + npm**
- **Foundry**
- **Git**
- **WSL2/Ubuntu** if running the Python/Foundry setup on Windows

You also need a **SerpApi API key**.

---

# 5. Setup

## Step 1 — Clone the repository

```bash
git clone https://github.com/agenthackzz022-creator/facetrace-chain.git
cd facetrace-chain
```

---

## Step 2 — Setup the backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

On Windows/WSL, the project can be accessed from:

```bash
cd /mnt/c/Users/YOUR_USERNAME/Downloads/facetrace-chain/backend
```

---

# 6. Configure `.env`

Create:

```text
backend/.env
```

Add:

```env
SERPAPI_KEY=YOUR_SERPAPI_KEY
ANVIL_RPC=http://127.0.0.1:8545
CONTRACT_ADDRESS=YOUR_DEPLOYED_CONTRACT_ADDRESS
PRIVATE_KEY=YOUR_ANVIL_PRIVATE_KEY
```

### Security

Never commit:

```text
backend/.env
```

to GitHub.

Never publish:

```text
SERPAPI_KEY
PRIVATE_KEY
```

---

# 7. Start the Blockchain

Open a new terminal:

```bash
anvil
```

Anvil will show test accounts and private keys.

Use one Anvil private key for local development:

```env
PRIVATE_KEY=0x...
```

---

# 8. Deploy the Smart Contract

Open another terminal:

```bash
cd contracts
```

Install Foundry's standard library if needed:

```bash
forge install foundry-rs/forge-std --no-commit
```

Build:

```bash
forge build
```

Deploy:

```bash
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --private-key YOUR_ANVIL_PRIVATE_KEY \
  --broadcast
```

Copy the deployed contract address into:

```text
backend/.env
```

```env
CONTRACT_ADDRESS=0x...
```

### Important

Anvil is a local development blockchain. If you restart Anvil, redeploy the contract and update `CONTRACT_ADDRESS`.

---

# 9. Start the Backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Backend:

```text
http://localhost:8000
```

Check:

```bash
curl http://localhost:8000/api/health
```

Expected:

```json
{
  "status": "ok",
  "serpapi_configured": true,
  "blockchain_configured": true
}
```

---

# 10. Start the Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The frontend communicates with the FastAPI backend on port `8000`.

---

# 11. How the Pipeline Works

## 01 — Face Detection

The uploaded image is processed locally with InsightFace.

The system detects faces and creates face embeddings.

---

## 02 — Image Fingerprint

The original image is preserved and hashed using:

```text
SHA-256
```

The original file is not replaced by the compressed search copy.

---

## 03 — Reverse-Image Search

A search-ready compressed copy is sent to:

```text
SerpApi
   ↓
Google Lens
```

The system retrieves live:

- exact matches
- visual matches
- source URLs
- titles
- image information

No search results are hardcoded.

---

## 04 — Face Match Analysis

For available candidate images, the system attempts:

```text
Download candidate
        ↓
Process image
        ↓
Detect face
        ↓
Create embedding
        ↓
Compare embeddings
```

A similarity score is shown **only when this processing succeeds**.

If the candidate cannot be processed, the score is shown as unavailable.

---

## 05 — Evidence Creation

The system creates a deterministic evidence record containing information such as:

- record ID
- original image hash
- metadata hash
- source URL
- selected search result

The evidence is then hashed.

---

## 06 — Blockchain Registration

The frontend sends the selected result to:

```http
POST /api/evidence/register
```

The backend records the evidence through the Solidity `EvidenceRegistry` contract on Anvil.

The blockchain record contains the evidence/integrity information rather than the original image itself.

---

## 07 — Verification

The frontend can request:

```http
POST /api/evidence/verify
```

The backend reads the blockchain record and compares:

```text
Local Evidence Hash
        =
On-Chain Evidence Hash
```

```text
Local Image Hash
        =
On-Chain Image Hash
```

```text
Local Metadata Hash
        =
On-Chain Metadata Hash
```

If the values match, the UI shows:

```text
VERIFIED
```

---

# 12. API Endpoints

### Health

```http
GET /api/health
```

Checks whether SerpApi and blockchain configuration are available.

### Analyze

```http
POST /api/analyze
```

Accepts an image upload and performs:

- face detection
- face encoding
- reverse-image search
- candidate processing
- similarity calculation
- SHA-256 fingerprint generation

### Register Evidence

```http
POST /api/evidence/register
```

Example:

```json
{
  "record_id": "analysis-record-id",
  "result_index": 0
}
```

Registers the selected search evidence on the blockchain.

### Verify Evidence

```http
POST /api/evidence/verify
```

Example:

```json
{
  "record_id": "analysis-record-id",
  "evidence_id": 1
}
```

Checks the local evidence against the blockchain record.

---

# 13. Blockchain

### Network

```text
Anvil
```

### RPC

```text
http://127.0.0.1:8545
```

### Smart Contract

```text
EvidenceRegistry.sol
```

### Stored evidence

The contract records integrity-related evidence such as:

- evidence hash
- image hash
- metadata hash
- source URL
- timestamp
- uploader

The actual image is not stored on-chain.

---

# 14. Known Limitations

### SerpApi dependency

Web discovery depends on SerpApi and Google Lens availability.

A timeout, API error, quota limit, or network problem can result in zero search results.

### Public indexed content only

The system can only discover content returned by the reverse-image-search provider. It does not access private accounts or private databases.

### Candidate image processing

Some returned images cannot be downloaded or processed because of:

- network restrictions
- blocked requests
- unavailable images
- unsupported content
- large files
- no detectable face

In those cases, no similarity score is shown.

### Similarity is not identity verification

Face similarity depends on the model and image quality.

It should not be interpreted as legal, biometric, or definitive identity proof.

### Local blockchain

Anvil is used for the prototype/demo. It is not a public production blockchain.

Restarting Anvil may reset the local chain state and require contract redeployment.

### Prototype status

Production use would require additional:

- authentication
- authorization
- privacy controls
- secure secret management
- rate limiting
- persistent storage
- production blockchain infrastructure
- legal/compliance review for biometric data

---

# 15. Troubleshooting

## `Failed to fetch`

Make sure the backend is running:

```bash
uvicorn app.main:app --reload --port 8000
```

Then:

```bash
curl http://localhost:8000/api/health
```

---

## SerpApi timeout

If you see:

```text
HTTPSConnectionPool(host='serpapi.com', port=443):
Read timed out
```

the frontend/backend connection is working, but the backend did not receive a timely response from SerpApi.

Check:

```bash
curl -I --max-time 20 https://serpapi.com
```

Then verify your API key.

---

## `No contract code found`

Anvil was probably restarted.

Do:

```text
Start Anvil
    ↓
Deploy contract again
    ↓
Update CONTRACT_ADDRESS
    ↓
Restart backend
```

---

# 16. Demo Flow

For the complete demonstration:

```text
1. Start Anvil
2. Deploy EvidenceRegistry
3. Configure .env
4. Start FastAPI
5. Start React frontend
6. Upload an authorized test image
7. Show face scanning
8. Show detected face
9. Show live web discovery
10. Show returned source
11. Show face similarity when available
12. Show SHA-256 evidence fingerprint
13. Show blockchain registration
14. Show Evidence ID / Block / Transaction
15. Show VERIFIED status
```

---

# 17. Task #3 Requirement Mapping

| Requirement | Implementation |
|---|---|
| Detect face | InsightFace |
| Encode face | InsightFace embeddings |
| Genuine reverse-image search | SerpApi + Google Lens |
| Real matching result | Live search response |
| No hardcoded results | Yes |
| Face comparison | Candidate image processing + embedding similarity |
| Tamper-evident record | SHA-256 |
| Blockchain | Solidity `EvidenceRegistry` |
| Blockchain network | Foundry Anvil |
| Verification | On-chain hash comparison |
| Source code | GitHub repository |
| Run instructions | This README |
| Limitations | Documented above |

---

# 18. Responsible Use

Use only images and web content that you are authorized to analyze.

FaceTrace Chain is a **technical evidence-discovery and integrity-verification prototype**. A search result or face similarity score should not be treated as definitive proof of a person's identity.

---

## Project Summary

**FaceTrace Chain turns an image into a verifiable evidence trail:**

```text
FACE
 ↓
SEARCH
 ↓
MATCH
 ↓
FINGERPRINT
 ↓
BLOCKCHAIN
 ↓
VERIFY
```

**Less noise. More signal.**
