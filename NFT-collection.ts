import {
  boolToByte,
  stringToBytes,
  u256ToBytes,
  bytesToString,
  bytesToU256,
  byteToBool,
  bytesToU64,
  u64ToBytes,
} from '@massalabs/as-types';
import {
  Context,
  Storage,
  transferCoins,
  Address,
} from '@massalabs/massa-as-sdk';
import { Args } from '@massalabs/as-types';
import { u256 } from 'as-bignum/assembly';
import {
  _approve,
  _balanceOf,
  _constructor,
  _getApproved,
  _isApprovedForAll,
  _name,
  _ownerOf,
  _setApprovalForAll,
  _symbol,
  _update,
  _transferFrom,
} from './NFT-internals';

export const OWNER_KEY = 'OWNER';
export const BASE_URI_KEY = stringToBytes('BASE_URI');

// Why are you setting a TOKEN_URI_KEY ? Shouldn't the token URI of a token be baseUri + tokenId ?
export const TOKEN_URI_KEY = stringToBytes('TOKEN_URI');


export const TOTAL_SUPPLY_KEY = stringToBytes('TOTAL_SUPPLY');
export const COUNTER_KEY = stringToBytes('COUNTER');
export const MINT_PRICE_KEY = stringToBytes('PRICE_PER_TOKEN');
export const START_TIME_KEY = stringToBytes('START_TIME');
export const MINT_PAUSED_KEY = stringToBytes('MINT_PAUSED');

// @custom:security-contact altailabs

export function constructor(_args: StaticArray<u8>): void {
  assert(Context.isDeployingContract());
  const args = new Args(_args);

  const name = args.nextString().expect('name argument is missing or invalid');
  const symbol = args
    .nextString()
    .expect('symbol argument is missing or invalid');
  const totalSupply = args
    .nextU256()
    .expect('totalSupply argument is missing or invalid');
  const baseURI = args
    .nextString()
    .expect('baseURI argument is missing or invalid');
  const tokenURI = args
    .nextString()
    .expect('tokenURI argument is missing or invalid');
  const mintPrice = args
    .nextU64()
    .expect('mintPrice argument is missing or invalid');
  const startTime = args
    .nextU64()
    .expect('startTime argument is missing or invalid');

  _constructor(name, symbol);

  Storage.set(TOTAL_SUPPLY_KEY, u256ToBytes(totalSupply));
  Storage.set(BASE_URI_KEY, stringToBytes(baseURI));

  // Same thing her, why are you setting a TOKEN_URI_KEY ? Shouldn't the token URI of a token be baseUri + tokenId ?
  Storage.set(TOKEN_URI_KEY, stringToBytes(tokenURI));
  Storage.set(MINT_PRICE_KEY, u64ToBytes(mintPrice));
  Storage.set(START_TIME_KEY, u64ToBytes(startTime));
  Storage.set(MINT_PAUSED_KEY, boolToByte(false));
  Storage.set(OWNER_KEY, Context.caller().toString());
  Storage.set(COUNTER_KEY, u256ToBytes(u256.Zero));
}

export function name(): string {
  return _name();
}

export function symbol(): string {
  return _symbol();
}
export function totalSupply(
  _: StaticArray<u8> = new StaticArray<u8>(0),
): StaticArray<u8> {
  return Storage.get(TOTAL_SUPPLY_KEY);
}

// How is this function different from the totalSupply function ?
// If I understand correctly, you use current supply as a counter to create new tokenIds. But since you don't have a burn function, the totalSupply will always be equal to the currentSupply.
// SO if my understanding is correct, you should remove this function and use the totalSupply function instead.
export function currentSupply(
  _: StaticArray<u8> = new StaticArray<u8>(0),
): StaticArray<u8> {
  return Storage.get(COUNTER_KEY);
}

export function baseURI(
  _: StaticArray<u8> = new StaticArray<u8>(0),
): StaticArray<u8> {
  return Storage.get(BASE_URI_KEY);
}

// I don't understand why you are setting a TOKEN_URI_KEY. Shouldn't the token URI of a token be baseUri + tokenId ?
// I suggest that you do the following instead:
// export function tokenURI(_args: StaticArray<u8>): StaticArray<u8> {
//   const args = new Args(_args);
//   const tokenId = args
//     .nextU256()
//     .expect('token id argument is missing or invalid')
//     .toString();
//   const baseUri = bytesToString(Storage.get(BASE_URI_KEY));
//  return stringToBytes(baseUri + tokenId);
export function tokenURI(_args: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(_args);
  const tokenId = args
    .nextU256()
    .expect('token id argument is missing or invalid')
    .toString();

  const uri = bytesToString(Storage.get(TOKEN_URI_KEY));
  const key = uri + tokenId;
  return stringToBytes(key);
}

// So anyone can mint a token right ? Is this intended ?
export function mint(_args: StaticArray<u8>): void {
  // Ok now I understand why you have separate functions for totalSupply and currentSupply.
  // You want to limit the total supply to a certain number of tokens.
  // I suggest that you create a MAX_SUPPLY_KEY and set it in the constructor, and use total supply as a counter.
  assert(
    bytesToU256(Storage.get(TOTAL_SUPPLY_KEY)) > bytesToU256(currentSupply()),
    'Max supply reached',
  );
  assert(!byteToBool(Storage.get(MINT_PAUSED_KEY)), 'Mint process paused');
  assert(
    Context.timestamp() >= bytesToU64(Storage.get(START_TIME_KEY)),
    'Mint has not started yet',
  );
  assert(
    Context.transferredCoins() >= bytesToU64(Storage.get(MINT_PRICE_KEY)),
    'Not enough sent coins to mint this NFT',
  );
  const args = new Args(_args);
  const mintAddress = args
    .nextString()
    .expect('mintAddress argument is missing or invalid');
  // Same thing here, you should use the totalSupply function instead of the currentSupply function.
  // You could event create an increment function that increments the totalSupply and returns the new value.
  const increment = bytesToU256(currentSupply()) + u256.One;
  Storage.set(COUNTER_KEY, u256ToBytes(increment));
  _update(mintAddress, increment, '');
}

// TokenURI is supposed to be the URI of a specific token, not the base URI.
// A setTokenURI function is not necessary, as the token URI should be baseUri + tokenId.
export function _setTokenURI(_args: StaticArray<u8>): void {
  assert(_onlyOwner(), 'only sc owner can access');
  const args = new Args(_args);
  const newTokenURI = args
    .nextString()
    .expect('tokenUri argument is missing or invalid');

  Storage.set(TOKEN_URI_KEY, stringToBytes(newTokenURI));
}

export function _setBaseURI(_args: StaticArray<u8>): void {
  assert(_onlyOwner(), 'only sc owner can access');
  const args = new Args(_args);
  const newBaseURI = args
    .nextString()
    .expect('tokenUri argument is missing or invalid');

  Storage.set(BASE_URI_KEY, stringToBytes(newBaseURI));
}

/**
 *
 * @param binaryArgs - serialized string representing the address whose balance we want to check
 * @returns a serialized u256 representing the balance of the address
 * @remarks As we can see, instead of checking the storage directly,
 * we call the _balanceOf function from the NFT-internals.
 */
export function balanceOf(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const address = args
    .nextString()
    .expect('address argument is missing or invalid');
  return u256ToBytes(_balanceOf(address));
}

/**
 *
 * @param binaryArgs - serialized u256 representing the tokenId whose owner we want to check
 * @returns a serialized string representing the address of owner of the tokenId
 */
export function ownerOf(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const tokenId = args
    .nextU256()
    .expect('tokenId argument is missing or invalid');
  return stringToBytes(_ownerOf(tokenId));
}

/**
 *
 * @param binaryArgs - serialized arguments representing the address of the sender,
 * the address of the recipient and the tokenId to transfer.
 *
 * @remarks This function is only callable by the owner of the tokenId or an approved operator.
 *
 */
export function transferFrom(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const from = args.nextString().expect('from argument is missing or invalid');
  const to = args.nextString().expect('to argument is missing or invalid');
  const tokenId = args
    .nextU256()
    .expect('tokenId argument is missing or invalid');
  _transferFrom(from, to, tokenId);
}

/**
 *
 * @param binaryArgs - serialized strings representing the address of the recipient and the tokenId to approve
 * @remarks This function is only callable by the owner of the tokenId or an approved operator.
 * Indeed, this will be checked by the _approve function of the NFT-internals.
 *
 */
export function approve(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const to = args.nextString().expect('to argument is missing or invalid');
  const tokenId = args
    .nextU256()
    .expect('tokenId argument is missing or invalid');
  _approve(to, tokenId);
}

/**
 *
 * @param binaryArgs - serialized arguments representing the address of the operator and a boolean value indicating
 * if the operator should be approved for all the caller's tokens
 *
 */
export function setApprovalForAll(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const to = args.nextString().expect('to argument is missing or invalid');
  const approved = args
    .nextBool()
    .expect('approved argument is missing or invalid');
  _setApprovalForAll(to, approved);
}

/**
 *
 * @param binaryArgs - serialized u256 representing the tokenId whose approved address we want to check
 * @returns a serialized string representing the address of the approved address of the tokenId
 */
export function getApproved(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const tokenId = args
    .nextU256()
    .expect('tokenId argument is missing or invalid');
  return stringToBytes(_getApproved(tokenId));
}

/**
 *
 * @param binaryArgs - serialized strings representing the address of an owner and an operator
 * @returns a serialized u8 representing a boolean value indicating if
 * the operator is approved for all the owner's tokens
 */
export function isApprovedForAll(binaryArgs: StaticArray<u8>): StaticArray<u8> {
  const args = new Args(binaryArgs);
  const owner = args
    .nextString()
    .expect('owner argument is missing or invalid');
  const operator = args
    .nextString()
    .expect('operator argument is missing or invalid');
  return boolToByte(_isApprovedForAll(owner, operator));
}

// Why do you export this function ? It is not used in the other contracts.
export function _onlyOwner(): bool {
  return Context.caller().toString() == Storage.get(OWNER_KEY);
}

// Why is there an _ before function name ? In general underscore is used to indicate that a function is internal or private.
export function _changePauseStatus(_args: StaticArray<u8>): void {
  assert(_onlyOwner(), 'only sc owner can access');
  const args = new Args(_args);
  const pause = args.nextBool().expect('pause argument is missing or invalid');
  Storage.set(MINT_PAUSED_KEY, boolToByte(pause));
}

// Why is there an _ before function name ?  In general underscore is used to indicate that a function is internal or private. 
export function _changeMintPrice(_args: StaticArray<u8>): void {
  assert(_onlyOwner(), 'only sc owner can access');
  const args = new Args(_args);
  // Please add an error message in the expect function
  const newPrice = args.nextU64().expect('');
  Storage.set(MINT_PRICE_KEY, u64ToBytes(newPrice));
}

// Send coins someone
export function adminSendCoins(binaryArgs: StaticArray<u8>): void {
  assert(_onlyOwner(), 'The caller is not the owner of the contract');
  const args = new Args(binaryArgs);
  // Please use expect function instead of unwrap and add an error message
  const address = args.nextString().unwrap();
  // Please use expect function instead of unwrap and add an error message
  const amount = args.nextU64().unwrap();

  transferCoins(new Address(address), amount);
}

// There is no transfer function in this contract. Why is that ?