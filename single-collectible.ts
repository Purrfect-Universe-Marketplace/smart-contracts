/**
 * Single Collectible for the NFT Marketplace
 */
import {
  Args,
  boolToByte,
  stringToBytes,
  u256ToBytes,
  bytesToString,
} from '@massalabs/as-types';
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
import { isDeployingContract, Storage } from '@massalabs/massa-as-sdk';

export const BASE_URI_KEY = stringToBytes('BASE_URI');

// Why are you setting a TOKEN_URI_KEY ? Shouldn't the token URI of a token be baseUri + tokenId ?
export const TOKEN_URI_KEY = stringToBytes('TOKEN_URI');

/**
 * @param binaryArgs - serialized strings representing the name and the symbol of the NFT
 *
 * @remarks This is the constructor of the contract. It can only be called once, when the contract is being deployed.
 * It expects two serialized arguments: the name and the symbol of the NFT.
 * Once the constructor has handled the deserialization, of the arguments,
 * it calls the _constructor function from the NFT-internals.
 *
 * Finally, it sets the owner of the contract to the caller of the constructor.
 */
export function constructor(binaryArgs: StaticArray<u8>): void {
  assert(isDeployingContract());
  const args = new Args(binaryArgs);
  const name = args.nextString().expect('name argument is missing or invalid');
  const symbol = args
    .nextString()
    .expect('symbol argument is missing or invalid');
  const baseURI = args
    .nextString()
    .expect('baseURI argument is missing or invalid');
  const tokenURI = args
    .nextString()
    .expect('tokenURI argument is missing or invalid');
  const ownerAddress = args
    .nextString()
    .expect('ownerAddress argument is missing or invalid');
  const tokenID = args
    .nextU256()
    .expect('tokenID argument is missing or invalid');

  _constructor(name, symbol);
  Storage.set(BASE_URI_KEY, stringToBytes(baseURI));
  Storage.set(TOKEN_URI_KEY, stringToBytes(tokenURI));
  _update(ownerAddress, tokenID, ''); // Mint for caller ( tokenID: 1)
}

export function name(): string {
  return _name();
}

export function symbol(): string {
  return _symbol();
}

// tokenURI should be baseURI + tokenId. See my other comments in NFT-collections.ts
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
 * @param binaryArgs - serialized arguments representing the address of the sender,
 * the address of the recipient and the tokenId to transfer.
 *
 * @remarks This function is only callable by the owner of the tokenId or an approved operator.
 *
 */
// So there is a transferFrom but no transfer function ? I don't understand the logic behind this.
export function transferFrom(binaryArgs: StaticArray<u8>): void {
  const args = new Args(binaryArgs);
  const from = args.nextString().expect('from argument is missing or invalid');
  const to = args.nextString().expect('to argument is missing or invalid');
  const tokenId = args
    .nextU256()
    .expect('tokenId argument is missing or invalid');
  _transferFrom(from, to, tokenId);
}
