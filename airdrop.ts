import {
  Args,
  bytesToString,
  bytesToU64,
  stringToBytes,
  u64ToBytes,
  boolToByte,
  bytesToU256,
  u256ToBytes,
} from '@massalabs/as-types';
import {
  Address,
  Context,
  Storage,
  call,
  generateEvent,
  transferCoins,
  setBytecode,
  balance,
} from '@massalabs/massa-as-sdk';
import { u256 } from 'as-bignum/assembly';

export const CONTRACT_OWNER_KEY = 'CONTRACT_OWNER';
export const MAS_AMOUNT_KEY = stringToBytes('MAS_AMOUNT');
export const PUR_AMOUNT_KEY = stringToBytes('PUR_AMOUNT');
export const CLAIM_IDENTIFIER_KEY = 'CLAIM_KEY';
export const NFT_SC_KEY = 'NFT_SC';
export const FT_SC_KEY = 'FT_SC';

// @custom:security-contact altailabs
export function constructor(binaryArgs: StaticArray<u8>): void {
  if (!Context.isDeployingContract()) {
    return;
  }

  const args = new Args(binaryArgs);
  const masAmount = args.nextU64().expect('MAS amount not provided.');
  const purAmount = args.nextU64().expect('PUR amount not provided.');
  const chapter = args.nextString().expect('Chapter not provided.');
  const nftSC = args.nextString().expect('NFT smart contract not provided.');
  const ftSC = args.nextString().expect('FT smart contract not provided.');

  Storage.set(CLAIM_IDENTIFIER_KEY, chapter);
  Storage.set(MAS_AMOUNT_KEY, u64ToBytes(masAmount));
  Storage.set(PUR_AMOUNT_KEY, u64ToBytes(purAmount));
  Storage.set(CONTRACT_OWNER_KEY, Context.caller().toString());
  Storage.set(NFT_SC_KEY, nftSC);
  Storage.set(FT_SC_KEY, ftSC);

  generateEvent('Airdrop initialized.');
}

// Helper Functions
function onlyOwner(): void {
  assert(
    Context.caller().toString() == Storage.get(CONTRACT_OWNER_KEY),
    'Caller is not the contract owner.',
  );
}

function getNFTOwner(nftSC: string, tokenID: u256): string {
  return bytesToString(
    call(new Address(nftSC), 'ownerOf', new Args().add(tokenID), 0),
  );
}

function transferPUR(ftSC: string, amount: u64): void {
  const calculateAmount = u256.mul(
    u256.from(u64(amount)),
    u256.from(u64(10 ** 18)),
  );
  call(
    new Address(ftSC),
    'transfer',
    new Args().add(Context.caller().toString()).add(calculateAmount),
    0,
  );
}

function generateClaimKey(prefix: string, tokenID: u256): string {
  const chapter = Storage.get(CLAIM_IDENTIFIER_KEY);
  return `${chapter}_${tokenID.toString()}_${prefix}`;
}

function checkTokenOwnership(nftSC: string, tokenID: u256): void {
  const owner = getNFTOwner(nftSC, tokenID);
  assert(
    owner == Context.caller().toString(),
    `Caller does not own token ID ${tokenID.toString()}`,
  );
}

function getAmountMAS(): u64 {
  return bytesToU64(Storage.get(MAS_AMOUNT_KEY));
}

function getAmountPUR(): u64 {
  return bytesToU64(Storage.get(PUR_AMOUNT_KEY));
}

// Airdrop Functions
export function claimMAS(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const tokenID = args.nextU256().expect('Token ID not provided.');

  const nftSC = Storage.get(NFT_SC_KEY);
  checkTokenOwnership(nftSC, tokenID);

  const key = generateClaimKey('MAS', tokenID);
  assert(!Storage.has(key), `Token ID ${tokenID.toString()} already claimed.`);

  const masAmount = getAmountMAS();
  transferCoins(new Address(Context.caller().toString()), masAmount);
  Storage.set(key, masAmount.toString());
}

export function claimPUR(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const tokenID = args.nextU256().expect('Token ID not provided.');

  const nftSC = Storage.get(NFT_SC_KEY);
  checkTokenOwnership(nftSC, tokenID);

  const key = generateClaimKey('PUR', tokenID);
  assert(!Storage.has(key), `Token ID ${tokenID.toString()} already claimed.`);

  const purAmount = getAmountPUR();
  const ftSC = Storage.get(FT_SC_KEY);
  transferPUR(ftSC, purAmount);
  Storage.set(key, purAmount.toString());
}

// Read Functions
export function hasClaimedMAS(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const tokenID = args.nextU256().expect('Token ID not provided.');

  const key = generateClaimKey('MAS', tokenID);
  if (Storage.has(key)) {
    return boolToByte(true);
  } else {
    return boolToByte(false);
  }
}

export function hasClaimedPUR(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const tokenID = args.nextU256().expect('Token ID not provided.');

  const key = generateClaimKey('PUR', tokenID);
  if (Storage.has(key)) {
    return boolToByte(true);
  } else {
    return boolToByte(false);
  }
}

export function getChapter(
  _: StaticArray<u8> = new StaticArray<u8>(0),
): string {
  return Storage.get(CLAIM_IDENTIFIER_KEY);
}

export function getMasBalance(
  _: StaticArray<u8> = new StaticArray<u8>(0),
): StaticArray<u8> {
  return u64ToBytes(balance());
}

export function getPurBalance(
  _: StaticArray<u8> = new StaticArray<u8>(0),
): StaticArray<u8> {
  const ftSC = Storage.get(FT_SC_KEY);

  const balanceSC = bytesToU256(
    call(
      new Address(ftSC),
      'balanceOf',
      new Args().add(Context.callee().toString()),
      0,
    ),
  );
  return u256ToBytes(balanceSC);
}

// Admin Functions
export function upgradeSmartContract(newBytecode: StaticArray<u8>): void {
  onlyOwner();
  setBytecode(newBytecode);
}

export function transferInternalMAS(binaryArgs: StaticArray<u8>): void {
  onlyOwner();
  const args = new Args(binaryArgs);
  const to = args.nextString().expect('Recipient address not provided.');
  const amount = args.nextU64().expect('Amount not provided.');
  transferCoins(new Address(to), amount);
}

export function transferInternalPUR(binaryArgs: StaticArray<u8>): void {
  onlyOwner();
  const args = new Args(binaryArgs);
  const amount = args.nextU64().expect('Amount not provided.');

  const ftSC = Storage.get(FT_SC_KEY);
  transferPUR(ftSC, amount);
}

export function updateChapter(binaryArgs: StaticArray<u8>): void {
  onlyOwner();
  const args = new Args(binaryArgs);
  const newChapter = args.nextString().expect('New chapter not provided.');
  Storage.set(CLAIM_IDENTIFIER_KEY, newChapter);
}

export function updateMASAmount(binaryArgs: StaticArray<u8>): void {
  onlyOwner();
  const args = new Args(binaryArgs);
  const newAmount = args.nextU64().expect('New MAS amount not provided.');
  Storage.set(MAS_AMOUNT_KEY, u64ToBytes(newAmount));
}

export function updatePURAmount(binaryArgs: StaticArray<u8>): void {
  onlyOwner();
  const args = new Args(binaryArgs);
  const newAmount = args.nextU64().expect('New PUR amount not provided.');
  Storage.set(PUR_AMOUNT_KEY, u64ToBytes(newAmount));
}

export function updateNFTContract(binaryArgs: StaticArray<u8>): void {
  onlyOwner();
  const args = new Args(binaryArgs);
  const newNFTSC = args
    .nextString()
    .expect('New NFT smart contract address not provided.');
  Storage.set(NFT_SC_KEY, newNFTSC);
}

export function updateFTContract(binaryArgs: StaticArray<u8>): void {
  onlyOwner();
  const args = new Args(binaryArgs);
  const newFTSC = args
    .nextString()
    .expect('New FT smart contract address not provided.');
  Storage.set(FT_SC_KEY, newFTSC);
}

// Receive function for contract to accept coins
export function receive(_: StaticArray<u8>): void {
  // Logic for receiving coins can be implemented if needed
}
