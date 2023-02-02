const nearAPI = require("near-api-js");
const Big = require("big.js");

const TGas = Big(10).pow(12);
const MaxGasPerTransaction = TGas.mul(250);
const StorageCostPerByte = Big(10).pow(19);

const MainnetContract = "social.near";
const MainNearConfig = {
  networkId: "mainnet",
  nodeUrl: "https://rpc.mainnet.near.org",
  archivalNodeUrl: "https://rpc.mainnet.internal.near.org",
  contractName: MainnetContract,
  walletUrl: "https://wallet.near.org",
  storageCostPerByte: StorageCostPerByte,
  apiUrl: "https://api.near.social",
  finalSynchronizationDelayMs: 3000,
};

const NearConfig = MainNearConfig;

const ApiEnabled = true;
const SupportedApiMethods = {
  get: true,
  keys: true,
};

const apiCall = async (methodName, args, blockId, fallback) => {
  if (!ApiEnabled || !(methodName in SupportedApiMethods)) {
    return fallback();
  }
  args = args || {};

  if (blockId) {
    args.blockHeight = blockId;
  }

  try {
    return await (
      await fetch(`${NearConfig.apiUrl}/${methodName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      })
    ).json();
  } catch (e) {
    console.log("API call failed", methodName, args);
    console.error(e);
    return fallback();
  }
};

async function functionCall(
  near,
  contractName,
  methodName,
  args,
  gas,
  deposit
) {
  console.log(
    "functionCall",
    contractName,
    methodName,
    JSON.stringify(args, null, 2),
    gas,
    deposit
  );
  near.logger.info("functionCall", {
    contractName,
    methodName,
    args,
    gas,
    deposit,
  });

  const txResult = await near.account.functionCall({
    contractId: contractName,
    methodName,
    args,
    gas: gas ?? TGas.mul(30).toFixed(0),
    attachedDeposit: deposit ?? "0",
  });
  near.logger.info("functionCallResult", { txResult });
  if (
    typeof txResult.status === "object" &&
    typeof txResult.status.SuccessValue === "string"
  ) {
    const value = Buffer.from(
      txResult.status.SuccessValue,
      "base64"
    ).toString();
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return null;
}

async function accountState(near, accountId) {
  const account = new nearAPI.Account(
    near.nearConnection.connection,
    accountId
  );
  return await account.state();
}

function setupContract(near, contractId, options) {
  const { viewMethods = [], changeMethods = [] } = options;
  const contract = {
    near,
    contractId,
  };
  viewMethods.forEach((methodName) => {
    contract[methodName] = (args) =>
      near.viewCall(contractId, methodName, args);
  });
  changeMethods.forEach((methodName) => {
    contract[methodName] = (args, gas, deposit) =>
      near.functionCall(contractId, methodName, args, gas, deposit);
  });
  return contract;
}

async function viewCall(
  provider,
  blockId,
  contractId,
  methodName,
  args,
  finality
) {
  args = args || {};
  const result = await provider.query({
    request_type: "call_function",
    account_id: contractId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    block_id: blockId,
    finality,
  });

  return (
    result.result &&
    result.result.length > 0 &&
    JSON.parse(Buffer.from(result.result).toString())
  );
}

async function initNear(logger) {
  const _near = { logger };
  _near.accountId = process.env.NEAR_ACCOUNT_ID;

  const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
  keyStore.setKey(
    NearConfig.networkId,
    _near.accountId,
    nearAPI.utils.KeyPair.fromString(process.env.NEAR_PRIVATE_KEY)
  );

  const nearConnection = await nearAPI.connect(
    Object.assign({ deps: { keyStore } }, NearConfig)
  );

  _near.account = new nearAPI.Account(
    nearConnection.connection,
    _near.accountId
  );

  _near.nearArchivalConnection = nearAPI.Connection.fromConfig({
    networkId: NearConfig.networkId,
    provider: {
      type: "JsonRpcProvider",
      args: { url: NearConfig.archivalNodeUrl },
    },
    signer: { type: "InMemorySigner", keyStore },
  });

  _near.keyStore = keyStore;
  _near.nearConnection = nearConnection;

  const transformBlockId = (blockId) =>
    blockId === "optimistic" || blockId === "final"
      ? {
          finality: blockId,
          blockId: undefined,
        }
      : blockId !== undefined && blockId !== null
      ? {
          finality: undefined,
          blockId: parseInt(blockId),
        }
      : {
          finality: "optimistic",
          blockId: undefined,
        };

  _near.viewCall = (contractId, methodName, args, blockHeightOrFinality) => {
    const { blockId, finality } = transformBlockId(blockHeightOrFinality);
    const nearViewCall = () =>
      viewCall(
        blockId
          ? _near.nearArchivalConnection.provider
          : _near.nearConnection.connection.provider,
        blockId ?? undefined,
        contractId,
        methodName,
        args,
        finality
      );

    return contractId === NearConfig.contractName && finality === "final"
      ? apiCall(methodName, args, blockId, nearViewCall)
      : nearViewCall();
  };

  _near.block = (blockHeightOrFinality) => {
    const blockQuery = transformBlockId(blockHeightOrFinality);
    const provider = blockQuery.blockId
      ? _near.nearArchivalConnection.provider
      : _near.nearConnection.connection.provider;
    return provider.block(blockQuery);
  };
  _near.functionCall = (contractName, methodName, args, gas, deposit) =>
    functionCall(_near, contractName, methodName, args, gas, deposit);
  _near.sendTransactions = (transactions) =>
    sendTransactions(_near, transactions);

  _near.contract = setupContract(_near, NearConfig.contractName, {
    viewMethods: [
      "storage_balance_of",
      "get",
      "get_num_accounts",
      "get_accounts_paged",
      "is_write_permission_granted",
      "keys",
    ],
    changeMethods: [
      "set",
      "grant_write_permission",
      "storage_deposit",
      "storage_withdraw",
    ],
  });

  _near.accountState = (accountId) => accountState(_near, accountId);

  return _near;
}

module.exports = { initNear, NearConfig, TGas, StorageCostPerByte };
