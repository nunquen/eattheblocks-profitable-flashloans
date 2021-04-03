pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "@studydefi/money-legos/dydx/contracts/DydxFlashloanBase.sol";
import "@studydefi/money-legos/dydx/contracts/ICallee.sol";
import { KyberNetworkProxy as IKyberNetworkProxy } from '@studydefi/money-legos/kyber/contracts/KyberNetworkProxy.sol';

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IUniswapV2Router02.sol";
import "./IWeth.sol";

// Inheriting from ICallee, DydxFlashloanBase smart contracts to have basic functionalities
contract Flashloan is ICallee, DydxFlashloanBase {
    
    enum Direction { KyberToUniswap, UniswapToKyber }
    
    struct ArbInfo {
        Direction direction;
        uint256 repayAmount;
    }

    // Defining exchanges and addresses pointers for smart contracts
    IKyberNetworkProxy kyber;
    IUniswapV2Router02 uniswap;
    IWeth weth;
    IERC20 dai;
    // This is constant value to deal with ETH in Kyber
    address constant KYBER_ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // This constructor is a special function that will be called when the smart contract is deployed to the blockchain
    constructor(
        address kyberAddress,
        address uniswapAddress,
        address weithAddress,
        address daiAddress
    ) public {
        kyber = IKyberNetworkProxy(kyberAddress);
        uniswap = IUniswapV2Router02(uniswapAddress);
        weth = IWeth(weithAddress);
        dai = IERC20(daiAddress);
    }

    // This is the function that will be called postLoan
    // i.e. Encode the logic to handle your flashloaned funds here
    function callFunction(
        address sender,
        Account.Info memory account,
        bytes memory data
    ) public {
        ArbInfo memory arbInfo = abi.decode(data, (ArbInfo));
        // getting dai balance
        unit256 balanceDai = dai.balanceOf(address(this));

        // IMPORTANT: this require section is where the contract is valid.
        //            if something fails then the contract will fial.
        require(
            balanceDai >= arbInfo.repayAmount,
            "Not enough funds to repay DyDx loan"
        );
    }

    function initiateFlashLoan(
        address _solo, 
        address _token, 
        uint256 _amount,
        Direction _direction)
        external
    {
        ISoloMargin solo = ISoloMargin(_solo);

        // Get marketId from token address
        uint256 marketId = _getMarketIdFromTokenAddress(_solo, _token);

        // Calculate repay amount (_amount + (2 wei))
        // Approve transfer from
        uint256 repayAmount = _getRepaymentAmountInternal(_amount);
        IERC20(_token).approve(_solo, repayAmount);

        // 1. Withdraw $
        // 2. Call callFunction(...)
        // 3. Deposit back $
        Actions.ActionArgs[] memory operations = new Actions.ActionArgs[](3);

        operations[0] = _getWithdrawAction(marketId, _amount);
        operations[1] = _getCallAction(
            // Encode ArbInfo for callFunction
            abi.encode(ArbInfo({direction: _direction, repayAmount: repayAmount}))
        );
        operations[2] = _getDepositAction(marketId, repayAmount);

        Account.Info[] memory accountInfos = new Account.Info[](1);
        accountInfos[0] = _getAccountInfo();

        solo.operate(accountInfos, operations);
    }
}
