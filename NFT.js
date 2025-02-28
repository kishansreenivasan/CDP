// nft-monitor.js - Monitors wallet for NFT transfers and triggers print/burn
const express = require('express');
const ethers = require('ethers');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

// Configuration
const PORT = process.env.PORT || 3000;
const PROVIDER_URL = process.env.PROVIDER_URL;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const PRINT_ENDPOINT = process.env.PRINT_ENDPOINT;
const PRIVATE_KEY = process.env.PRIVATE_KEY; // Only needed for burning

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize ethers provider
const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);

// Create wallet for burning (if private key provided)
const wallet = PRIVATE_KEY;

// ERC-721 transfer event signature
const ERC721_TRANSFER_TOPIC = ethers.utils.id('Transfer(address,address,uint256)');

// Basic ERC-721 ABI
const ERC721_ABI = [
  'function tokenURI(uint256 tokenId) external view returns (string memory)',
  'function transferFrom(address from, address to, uint256 tokenId) external',
  'function burn(uint256 tokenId) external'
];

// Burn address
const BURN_ADDRESS = '0x0000000000000000000000000000000000000000';

// Ensure images directory exists
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    
    // Extract data from webhook (adjust based on your webhook provider's format)
    // This example assumes Alchemy's webhook format
    const event = req.body.event;
    
    if (event && event.activity) {
      for (const activity of event.activity) {
        if (
          activity.toAddress && 
          activity.toAddress.toLowerCase() === WALLET_ADDRESS.toLowerCase() &&
          activity.category === 'erc721'
        ) {
          console.log('NFT transfer detected to our wallet:', activity);
          
          // Process the NFT
          await processNft(
            activity.contractAddress,
            activity.tokenId.toString()
          );
        }
      }
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Function to process an NFT
async function processNft(contractAddress, tokenId) {
  console.log(`Processing NFT: ${contractAddress} - Token ID ${tokenId}`);
  
  try {
    // 1. Get NFT metadata and image
    const nftContract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    const tokenUri = await nftContract.tokenURI(tokenId);
    const resolvedUri = resolveIpfsUri(tokenUri);
    
    // Fetch metadata
    const response = await axios.get(resolvedUri);
    const metadata = response.data;
    
    // Resolve image URL
    let imageUrl = metadata.image;
    if (imageUrl.startsWith('ipfs://')) {
      imageUrl = resolveIpfsUri(imageUrl);
    }
    
    // 2. Download image
    const imagePath = await downloadImage(imageUrl, tokenId);
    console.log(`Image downloaded to: ${imagePath}`);
    
    // 3. Send to print server
    await printNft(imagePath);
    console.log('NFT sent to printer');
    
    // 4. Burn the NFT (if configured)
    if (wallet && process.env.BURN_AFTER_PRINT === 'true') {
      await burnNft(contractAddress, tokenId);
      console.log('NFT burned successfully');
    }
    
    return true;
  } catch (error) {
    console.error('Error processing NFT:', error);
    throw error;
  }
}

// Resolve IPFS URIs
function resolveIpfsUri(uri) {
  if (uri.startsWith('ipfs://')) {
    const ipfsHash = uri.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${ipfsHash}`;
  }
  return uri;
}

// Download NFT image
async function downloadImage(url, tokenId) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const contentType = response.headers['content-type'];
  const extension = contentType.split('/')[1] || 'png';
  
  const imagePath = path.join(imagesDir, `nft-${tokenId}.${extension}`);
  fs.writeFileSync(imagePath, Buffer.from(response.data));
  
  return imagePath;
}

// Send image to print server
async function printNft(imagePath) {
  const form = new FormData();
  form.append('image', fs.createReadStream(imagePath), path.basename(imagePath));
  
  try {
    const response = await axios.post(PRINT_ENDPOINT, form, {
      headers: {
        ...form.getHeaders()
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error sending to print service:', error.message);
    throw error;
  }
}

// Burn the NFT
async function burnNft(contractAddress, tokenId) {
  if (!wallet) {
    throw new Error('Private key not configured for burning NFTs');
  }
  
  const nftContract = new ethers.Contract(contractAddress, ERC721_ABI, wallet);
  
  try {
    // Try burn() function first
    try {
      const tx = await nftContract.burn(tokenId);
      return await tx.wait();
    } catch (burnError) {
      console.log('Burn function not available, using transferFrom instead');
      
      // Fall back to transferring to burn address
      const tx = await nftContract.transferFrom(WALLET_ADDRESS, BURN_ADDRESS, tokenId);
      return await tx.wait();
    }
  } catch (error) {
    console.error('Failed to burn NFT:', error);
    throw error;
  }
}

// Start direct blockchain monitoring
function startWalletMonitoring() {
  console.log(`Starting to monitor NFT transfers to wallet: ${WALLET_ADDRESS}`);
  
  // Filter for Transfer events to our wallet
  const filter = {
    topics: [
      ERC721_TRANSFER_TOPIC,
      null, // from address (any)
      ethers.utils.hexZeroPad(WALLET_ADDRESS, 32) // to address (our wallet)
    ]
  };
  
  // Listen for events
  provider.on(filter, async (log) => {
    try {
      // Extract NFT details
      const tokenId = ethers.BigNumber.from(log.topics[3]).toString();
      const contractAddress = log.address;
      
      console.log(`NFT transfer detected on-chain: Contract ${contractAddress}, Token ID ${tokenId}`);
      
      // Process the NFT
      await processNft(contractAddress, tokenId);
    } catch (error) {
      console.error('Error handling transfer event:', error);
    }
  });
}

// Start the server
app.listen(PORT, () => {
  console.log(`NFT monitor server running on port ${PORT}`);
  console.log(`Monitoring wallet: ${WALLET_ADDRESS}`);
  console.log(`Print endpoint: ${PRINT_ENDPOINT}`);
  
  // Start blockchain monitoring
  startWalletMonitoring();
});