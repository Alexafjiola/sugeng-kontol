const { ethers } = require("ethers");
const axios = require("axios");
const chalk = require("chalk");

// Replace with your own provider URL
const providerUrl = "https://testnet-rpc.plumenetwork.xyz/http";

// List of private keys for multiple accounts
const privateKeys = [
    "5434aaa753a954b0c867f1458fcd0796b7decdcaeb5f249b0e5df96d63274d2a",
    "59a0688c6fc899cc2a5a9868074d33c980416d3999729286d73273e1d6fb9b10",
    "2afd54afdc2a81d5ffed203045c565cbacee81aa6c8b85b8ac145e30825c08dd",
  // Add more private keys as needed
];

const swapContractAddress = "0x4c722A53Cf9EB5373c655E1dD2dA95AcC10152D1"; // SWAP contract address
const erc20ContractAddress = "0xba22114ec75f0d55c34a5e5a3cf384484ad9e733"; // ERC20 token address for quote token

// Define the ABI for the SWAP contract and ERC20 contract
const swapAbi = [
  "function swap(address base, address quote, uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 tip, uint128 limitPrice, uint128 minOut, uint8 reserveFlags) public"
];

const erc20Abi = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function balanceOf(address account) public view returns (uint256)"
];

// Define the parameters for the swap function
const base = "0x5c1409a46cd113b3a667db6df0a8d7be37ed3bb3"; // Token yang akan dijual
const quote = erc20ContractAddress; // Token yang dibeli
const poolIdx = 36000;
const isBuy = false; // Swapping from base to quote
const inBaseQty = false;
const qty = ethers.BigNumber.from("1600000000000000"); // Jumlah token yang akan di-swap
const tip = 0;
const limitPrice = ethers.BigNumber.from("65537");
const minOut = ethers.BigNumber.from("1582401200012376200");
const reserveFlags = 0;

async function requestFaucet(walletAddress, token) {
  try {
    console.log(chalk.yellow(`Requesting faucet for ${walletAddress}...`)); // Informasi awal

    const url = "https://faucet.plumenetwork.xyz/api/faucet";
    const response = await axios.post(url, {
      walletAddress,
      token
    });

    if (response.status === 200 || response.status === 202) {
      const data = response.data;
      if (data.status === 'Limit reached') {
        console.log(chalk.red(`Limit reached for ${walletAddress}. Skipping faucet request.`));
        return null;
      }
      console.log(chalk.green(`Faucet request successful for ${walletAddress}. Salt: ${data.salt}, Signature: ${data.signature}`)); // Informasi sukses
      return { salt: data.salt, signature: data.signature };
    } else {
      console.log(chalk.red(`Failed to fetch faucet: ${response.status} - ${response.statusText}`));
      return null;
    }
  } catch (error) {
    console.error(chalk.red("Error requesting faucet:"), error);
    return null;
  }
}

async function executeSwapForAccount(privateKey) {
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(chalk.green("Wallet address:"), wallet.address);

  // Request GOON token from faucet
  const faucetResponse = await requestFaucet(wallet.address, "GOON");

  if (!faucetResponse) {
    console.log(chalk.yellow("Skipping swap due to faucet limit."));
    return;
  }

  // Create contract instances
  const swapContract = new ethers.Contract(swapContractAddress, swapAbi, wallet);
  const erc20Contract = new ethers.Contract(erc20ContractAddress, erc20Abi, wallet);

  try {
    // Check allowance
    const allowance = await erc20Contract.allowance(wallet.address, swapContractAddress);
    console.log(chalk.cyan("Current allowance for swap contract:"), allowance.toString());

    // Check token balance for quote token
    const tokenBalance = await erc20Contract.balanceOf(wallet.address);
    console.log(chalk.cyan("Current token balance:"), tokenBalance.toString());

    // Check ETH balance
    const ethBalance = await provider.getBalance(wallet.address);
    console.log(chalk.cyan("ETH balance:"), ethers.utils.formatEther(ethBalance));

    if (allowance.lt(qty)) {
      console.log(chalk.yellow("Approving token..."));

      // Manually set gas limit and gas price for approval
      const approvalGasLimit = 100000;
      const approvalGasPrice = ethers.utils.parseUnits("1", "gwei");

      // Approve the SWAP contract to spend the tokens
      const approvalTx = await erc20Contract.approve(swapContractAddress, qty, {
        gasPrice: approvalGasPrice,
        gasLimit: approvalGasLimit
      });

      console.log(chalk.magenta("Approval transaction sent:"), approvalTx.hash);
      await approvalTx.wait();
      console.log(chalk.magenta("Approval transaction mined in block:"), (await approvalTx.wait()).blockNumber);
    }

    console.log(chalk.yellow("Executing swap..."));
    // Manually set gas limit and gas price for swap
    const swapGasLimit = 500000; // Increased gas limit
    const swapGasPrice = ethers.utils.parseUnits("1", "gwei"); // Increased gas price

    // Send transaction with increased gas price and manual gas limit
    const tx = await swapContract.swap(
      base,
      quote,
      poolIdx,
      isBuy,
      inBaseQty,
      qty,
      tip,
      limitPrice,
      minOut,
      reserveFlags,
      {
        maxFeePerGas: swapGasPrice,
        maxPriorityFeePerGas: swapGasPrice,
        gasLimit: swapGasLimit
      }
    );

    console.log(chalk.blue("Transaction sent:"), tx.hash);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log(chalk.blue("Transaction mined in block:"), receipt.blockNumber);
  } catch (error) {
    console.error(chalk.red("Error executing swap:"), error);
  }
}

async function executeSwaps() {
  for (const key of privateKeys) {
    console.log(chalk.bgGray("Processing account with private key:"), key);
    await executeSwapForAccount(key);
  }
}

executeSwaps();
