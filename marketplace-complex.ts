/*
Complex Class for NFT Marketplace
- Bids 
- Collections
- Sell Offers
*/

import { Serializable, Result, Args } from '@massalabs/as-types';

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

export class Bid implements Serializable {
  constructor(
    public bidder: string = '',
    public amount: u64 = 0,
    public timestamp: u64 = 0,
  ) {}

  serialize(): StaticArray<u8> {
    const args = new Args();

    args.add<string>(this.bidder);
    args.add<u64>(this.amount);
    args.add<u64>(this.timestamp);
    return args.serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);

    const bidderResult = args.nextString();
    if (bidderResult.isErr()) return new Result(0);
    this.bidder = bidderResult.unwrap();

    const amountResult = args.nextU64();
    if (amountResult.isErr()) return new Result(0);
    this.amount = amountResult.unwrap();

    const timestampResult = args.nextU64();
    if (timestampResult.isErr()) return new Result(0);
    this.timestamp = timestampResult.unwrap();

    return new Result(args.offset);
  }
}
