/*
Massexplo
Marketplace - Complex Class - Item - Collection - Sell 
*/

// Comments for the whole file:

// Why do you use the unwrap method ? 
// It's better to use the expect method with an error message. 
// In case of an error, the error message will be displayed, and you will know what went wrong.


import { Serializable, Result, Args } from '@massalabs/as-types';

export class ItemDetail implements Serializable {
  constructor(
    public name: string = '',
    public symbol: string = '',
    public address: string = '',
    public baseURI: string = '',
    public tokenURI: string = '',
  ) {}

  serialize(): StaticArray<u8> {
    const args = new Args();

    args.add<string>(this.name);
    args.add<string>(this.symbol);
    args.add<string>(this.address);
    args.add<string>(this.baseURI);
    args.add<string>(this.tokenURI);
    return args.serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);

    const nameResult = args.nextString();
    if (nameResult.isErr()) return new Result(0);
    this.name = nameResult.unwrap();

    const symbolResult = args.nextString();
    if (symbolResult.isErr()) return new Result(0);
    this.symbol = symbolResult.unwrap();

    const addressResult = args.nextString();
    if (addressResult.isErr()) return new Result(0);
    this.address = addressResult.unwrap();

    const baseURIResult = args.nextString();
    if (baseURIResult.isErr()) return new Result(0);
    this.baseURI = baseURIResult.unwrap();

    const tokenURIResult = args.nextString();
    if (tokenURIResult.isErr()) return new Result(0);
    this.tokenURI = tokenURIResult.unwrap();

    return new Result(args.offset);
  }
}

export class CollectionDetail implements Serializable {
  constructor(
    public name: string = '',
    public desc: string = '',
    public address: string = '',
    public externalWebsite: string = '',
    public bannerImage: string = '',
    public backgroundImage: string = '',
    public collectionLogoImage: string = '',
  ) {}

  serialize(): StaticArray<u8> {
    const args = new Args();

    args.add<string>(this.name);
    args.add<string>(this.desc);
    args.add<string>(this.address);
    args.add<string>(this.externalWebsite);
    args.add<string>(this.bannerImage);
    args.add<string>(this.backgroundImage);
    args.add<string>(this.collectionLogoImage);
    return args.serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);

    const nameResult = args.nextString();
    if (nameResult.isErr()) return new Result(0);
    this.name = nameResult.unwrap();

    const descResult = args.nextString();
    if (descResult.isErr()) return new Result(0);
    this.desc = descResult.unwrap();

    const addressResult = args.nextString();
    if (addressResult.isErr()) return new Result(0);
    this.address = addressResult.unwrap();

    const externalWebsiteResult = args.nextString();
    if (externalWebsiteResult.isErr()) return new Result(0);
    this.externalWebsite = externalWebsiteResult.unwrap();

    const bannerImageResult = args.nextString();
    if (bannerImageResult.isErr()) return new Result(0);
    this.bannerImage = bannerImageResult.unwrap();

    const backgroundImageResult = args.nextString();
    if (backgroundImageResult.isErr()) return new Result(0);
    this.backgroundImage = backgroundImageResult.unwrap();

    const collectionLogoImageResult = args.nextString();
    if (collectionLogoImageResult.isErr()) return new Result(0);
    this.collectionLogoImage = collectionLogoImageResult.unwrap();

    return new Result(args.offset);
  }
}

export class SellOffer implements Serializable {
  constructor(
    public collectionAddress: string = '',
    public tokenId: string = '',
    public price: u64 = 0,
    public creatorAddress: string = '',
    public expirationTime: u64 = 0,
    public createdTime: u64 = 0,
  ) {}

  serialize(): StaticArray<u8> {
    const args = new Args();

    args.add<string>(this.collectionAddress);
    args.add<string>(this.tokenId);
    args.add<u64>(this.price);
    args.add<string>(this.creatorAddress);
    args.add<u64>(this.expirationTime);
    args.add<u64>(this.createdTime);
    return args.serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);

    const collectionAddressResult = args.nextString();
    if (collectionAddressResult.isErr()) return new Result(0);
    this.collectionAddress = collectionAddressResult.unwrap();

    const tokenIdResult = args.nextString();
    if (tokenIdResult.isErr()) return new Result(0);
    this.tokenId = tokenIdResult.unwrap();

    const priceResult = args.nextU64();
    if (priceResult.isErr()) return new Result(0);
    this.price = priceResult.unwrap();

    const creatorAddressResult = args.nextString();
    if (creatorAddressResult.isErr()) return new Result(0);
    this.creatorAddress = creatorAddressResult.unwrap();

    const expirationTimeResult = args.nextU64();
    if (expirationTimeResult.isErr()) return new Result(0);
    this.expirationTime = expirationTimeResult.unwrap();

    const createdTimeResult = args.nextU64();
    if (createdTimeResult.isErr()) return new Result(0);
    this.createdTime = createdTimeResult.unwrap();

    return new Result(args.offset);
  }
}