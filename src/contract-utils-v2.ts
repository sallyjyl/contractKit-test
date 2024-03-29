import { CURRENCY_ENUM as Tokens } from '@celo/utils'
import BigNumber from 'bignumber.js'
import Web3 from 'web3'
import { TransactionObject } from 'web3/eth/types'
import { TransactionReceipt } from 'web3/types'
import { GoldTokenAddress } from '../contracts/GoldToken'
import { StableTokenAddress } from '../contracts/StableToken'
import { Exchange } from '../types/Exchange'
import { GasPriceMinimum as GasPriceMinimumType } from '../types/GasPriceMinimum'
import { GoldToken as GoldTokenType } from '../types/GoldToken'
import { StableToken as StableTokenType } from '../types/StableToken'
import {
  getExchangeContract,
  getGasPriceMinimumContract,
  getGoldTokenContract,
  getStableTokenContract,
} from './contracts'
import { getErc20Balance } from './erc20-utils'
import { Logger } from './logger'
import { CeloTransaction } from './transaction-utils'

export default class ContractUtils {
  static async getGoldBalance(web3: Web3, accountNumber: string): Promise<BigNumber> {
    const goldToken: GoldTokenType = await getGoldTokenContract(web3)
    const balance = await getErc20Balance(goldToken, accountNumber, web3)
    Logger.debug(
      `contract-util-v2@getGoldBalance`,
      `Celo Gold balance(${accountNumber}): ${balance}`
    )
    return balance
  }

  static async getDollarBalance(web3: Web3, accountNumber: string): Promise<BigNumber> {
    const stableToken: StableTokenType = await getStableTokenContract(web3)
    const balance = await getErc20Balance(stableToken, accountNumber, web3)
    Logger.debug(
      `contract-util-v2@getDollarBalance`,
      `Celo Dollar balance(${accountNumber}): ${balance}`
    )
    return balance
  }

  static async getTotalGoldSupply(web3: Web3): Promise<BigNumber> {
    const goldToken: GoldTokenType = await getGoldTokenContract(web3)
    return new BigNumber(await goldToken.methods.totalSupply().call())
  }

  static async getExchangeRate(
    web3: Web3,
    makerToken: Tokens.GOLD | Tokens.DOLLAR,
    makerAmount: BigNumber = new BigNumber(1000 * 1000000000000000000) // Assume large makerAmount in wei to show worst case rate
  ): Promise<BigNumber> {
    const exchange: Exchange = await getExchangeContract(web3)
    const sellGold = makerToken === Tokens.GOLD
    const takerAmount = new BigNumber(
      await exchange.methods.getBuyTokenAmount(makerAmount.toString(), sellGold).call()
    )
    return makerAmount.dividedBy(takerAmount) // Number of takerTokens received for one makerToken
  }

  static async sendGold(
    web3: Web3,
    fromAccountNumber: string,
    toAccountNumber: string,
    amount: BigNumber,
    gasFees: BigNumber,
    gasPrice?: BigNumber,
    gasFeeRecipient?: string,
    gasCurrency: Tokens = Tokens.GOLD,
    networkId?: number
  ): Promise<TransactionReceipt> {
    // Do nothing for the default currency Gold
    let gasCurrencyAddress: string | undefined
    if (gasCurrency !== Tokens.GOLD) {
      gasCurrencyAddress = await ContractUtils.getAddressForCurrencyContract(gasCurrency)
    }
    if (gasPrice === undefined) {
      gasPrice = await ContractUtils.getGasPrice(web3, gasCurrency)
      Logger.debug('sendGold', `Gas price will be ${gasPrice}`)
    }

    const transaction: CeloTransaction = {
      chainId: networkId,
      from: fromAccountNumber,
      to: toAccountNumber,
      value: amount.toString(),
      gas: gasFees.toString(),
      gasPrice: gasPrice.toString(),
      gasCurrency: gasCurrencyAddress,
      gasFeeRecipient,
    }
    Logger.debug('sendGold', `Transaction is ${JSON.stringify(transaction)}`)
    return web3.eth.sendTransaction(transaction)
  }

  static async sendDollar(
    web3: Web3,
    fromAccountNumber: string,
    toAccountNumber: string,
    amount: BigNumber,
    gasFees: BigNumber,
    gasPrice?: BigNumber,
    gasFeeRecipient?: string,
    gasCurrency: Tokens = Tokens.GOLD,
    networkId?: number
  ): Promise<boolean> {
    // Do nothing for the default currency Gold
    let gasCurrencyAddress: string | undefined
    if (gasCurrency !== Tokens.GOLD) {
      gasCurrencyAddress = await ContractUtils.getAddressForCurrencyContract(gasCurrency)
    }
    if (gasPrice === undefined) {
      gasPrice = await ContractUtils.getGasPrice(web3, gasCurrency)
      Logger.debug('sendGold', `Gas price will be ${gasPrice}`)
    }

    const stableTokenContract = await getStableTokenContract(web3)
    const tx: TransactionObject<boolean> = await stableTokenContract.methods.transfer(
      toAccountNumber,
      amount.toString()
    )

    const celoTransactionParams: CeloTransaction = {
      chainId: networkId,
      from: fromAccountNumber,
      gas: gasFees.toString(),
      gasPrice: gasPrice.toString(),
      gasCurrency: gasCurrencyAddress,
      gasFeeRecipient,
    }
    return tx.send(celoTransactionParams)
  }

  static async performExchange(
    web3: Web3,
    fromAccountNumber: string,
    sellAmount: BigNumber,
    sellCurrency: Tokens,
    minBuyAmount: BigNumber,
    gasFee: BigNumber
  ) {
    const exchange: any | null = await getExchangeContract(web3)
    const sellGold = sellCurrency === Tokens.GOLD
    const tx = await exchange.methods.exchange(
      sellAmount.toString(),
      minBuyAmount.toString(),
      sellGold
    )
    return tx.send({ from: fromAccountNumber, gas: gasFee.toString() })
  }

  static async getGasPrice(web3: Web3, gasCurrency: Tokens = Tokens.GOLD): Promise<BigNumber> {
    const gasPriceMinimum: GasPriceMinimumType = await getGasPriceMinimumContract(web3)
    const currencyAddress: string = await ContractUtils.getAddressForCurrencyContract(gasCurrency)

    const gasPriceMinimumInCurrency = await gasPriceMinimum.methods
      .getGasPriceMinimum(currencyAddress)
      .call()

    return new BigNumber(gasPriceMinimumInCurrency).times(5)
  }

  static getAddressForCurrencyContract(currency: Tokens): string {
    switch (currency) {
      case Tokens.DOLLAR:
        return StableTokenAddress
      case Tokens.GOLD:
        return GoldTokenAddress
    }
  }
}
