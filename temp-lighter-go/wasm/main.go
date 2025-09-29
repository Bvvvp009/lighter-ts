package main

import (
    "fmt"
    "strconv"
    "time"
    "syscall/js"

    "github.com/elliottech/lighter-go/client"
    "github.com/elliottech/lighter-go/types"
)

var (
	txClient        *client.TxClient
	backupTxClients map[uint8]*client.TxClient
)

func wrapErr(err error) string {
	if err != nil {
		return fmt.Sprintf("%v", err)
	}
	return ""
}

//export GenerateAPIKey
func GenerateAPIKey(seed string) (privateKey, publicKey, err string) {
	var goErr error
	var privateKeyStr string
	var publicKeyStr string

	defer func() {
		if r := recover(); r != nil {
			goErr = fmt.Errorf("%v", r)
		}
		if goErr != nil {
			err = wrapErr(goErr)
		}
	}()

	// For now, just return the seed as both private and public key
	// In a real implementation, you would generate the key pair properly
	privateKeyStr = seed
	publicKeyStr = seed // This should be the actual public key

	return privateKeyStr, publicKeyStr, ""
}

//export CreateClient
func CreateClient(apiKey, accountIndex, rpcUrl string) (clientIndex string, err string) {
	var goErr error
	var clientIdx string

	defer func() {
		if r := recover(); r != nil {
			goErr = fmt.Errorf("%v", r)
		}
		if goErr != nil {
			err = wrapErr(goErr)
		}
	}()

	// Parse account index
	accIdx, goErr := strconv.ParseInt(accountIndex, 10, 64)
	if goErr != nil {
		return "", wrapErr(fmt.Errorf("invalid account index: %s", accountIndex))
	}

	// Create HTTP client (nil for now since we don't need it for signing)
	var httpClient *client.HTTPClient = nil
	
	// Create client with proper parameters
	txClient, goErr = client.NewTxClient(httpClient, apiKey, accIdx, 0, 1) // apiKeyIndex=0, chainId=1
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	clientIdx = "0" // Single client for now
	return clientIdx, ""
}

//export SignCreateOrder
func SignCreateOrder(clientIndex, accountIndex, market, side, orderType, size, price, timeInForce, reduceOnly, postOnly, ioc, makerOnly string) (txInfo string, err string) {
	var goErr error
	var txInfoStr string

	defer func() {
		if r := recover(); r != nil {
			goErr = fmt.Errorf("%v", r)
		}
		if goErr != nil {
			err = wrapErr(goErr)
		}
	}()

	if txClient == nil {
		return "", wrapErr(fmt.Errorf("client not initialized"))
	}

	// Parse parameters
	marketIdx, goErr := strconv.ParseUint(market, 10, 8)
	if goErr != nil {
		return "", wrapErr(fmt.Errorf("invalid market index: %s", market))
	}
	
	baseAmount, goErr := strconv.ParseInt(size, 10, 64)
	if goErr != nil {
		return "", wrapErr(fmt.Errorf("invalid size: %s", size))
	}
	
	priceUint, goErr := strconv.ParseUint(price, 10, 32)
	if goErr != nil {
		return "", wrapErr(fmt.Errorf("invalid price: %s", price))
	}
	
	var isAsk uint8 = 0
	if side == "buy" {
		isAsk = 1
	}
	
	var orderTypeUint uint8 = 0
	if orderType == "limit" {
		orderTypeUint = 1
	}
	
	var timeInForceUint uint8 = 0
	if timeInForce == "GTC" {
		timeInForceUint = 1
	} else if timeInForce == "IOC" {
		timeInForceUint = 2
	}
	
	var reduceOnlyUint uint8 = 0
	if reduceOnly == "true" {
		reduceOnlyUint = 1
	}

	// Create order request
	orderReq := &types.CreateOrderTxReq{
		MarketIndex:      uint8(marketIdx),
		ClientOrderIndex: 0, // Will be set by the client
		BaseAmount:       baseAmount,
		Price:            uint32(priceUint),
		IsAsk:            isAsk,
		Type:             orderTypeUint,
		TimeInForce:      timeInForceUint,
		ReduceOnly:       reduceOnlyUint,
		TriggerPrice:     0,
		OrderExpiry:      0,
	}

	// Get the transaction
	txInfoObj, goErr := txClient.GetCreateOrderTransaction(orderReq, nil)
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	// Get the transaction info string
	txInfoStr, goErr = txInfoObj.GetTxInfo()
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	return txInfoStr, ""
}

//export SignCancelOrder
func SignCancelOrder(clientIndex, accountIndex, orderId string) (txInfo string, err string) {
	var goErr error
	var txInfoStr string

	defer func() {
		if r := recover(); r != nil {
			goErr = fmt.Errorf("%v", r)
		}
		if goErr != nil {
			err = wrapErr(goErr)
		}
	}()

	if txClient == nil {
		return "", wrapErr(fmt.Errorf("client not initialized"))
	}

	// Parse order ID
	orderIdInt, goErr := strconv.ParseInt(orderId, 10, 64)
	if goErr != nil {
		return "", wrapErr(fmt.Errorf("invalid order ID: %s", orderId))
	}

	// Create cancel order request
	cancelReq := &types.CancelOrderTxReq{
		MarketIndex: 0, // Default market
		Index:       orderIdInt,
	}

	// Get the transaction
	txInfoObj, goErr := txClient.GetCancelOrderTransaction(cancelReq, nil)
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	// Get the transaction info string
	txInfoStr, goErr = txInfoObj.GetTxInfo()
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	return txInfoStr, ""
}

//export SignTransfer
func SignTransfer(clientIndex, accountIndex, toAccount, asset, amount string) (txInfo string, err string) {
	var goErr error
	var txInfoStr string

	defer func() {
		if r := recover(); r != nil {
			goErr = fmt.Errorf("%v", r)
		}
		if goErr != nil {
			err = wrapErr(goErr)
		}
	}()

	if txClient == nil {
		return "", wrapErr(fmt.Errorf("client not initialized"))
	}

	// Parse parameters
	toAccountInt, goErr := strconv.ParseInt(toAccount, 10, 64)
	if goErr != nil {
		return "", wrapErr(fmt.Errorf("invalid to account: %s", toAccount))
	}
	
	amountInt, goErr := strconv.ParseInt(amount, 10, 64)
	if goErr != nil {
		return "", wrapErr(fmt.Errorf("invalid amount: %s", amount))
	}

	// Create transfer request
	transferReq := &types.TransferTxReq{
		ToAccountIndex: toAccountInt,
		USDCAmount:     amountInt,
		Fee:            0, // Will be set by the client
		Memo:           [32]byte{}, // Empty memo
	}

	// Get the transaction
	txInfoObj, goErr := txClient.GetTransferTransaction(transferReq, nil)
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	// Get the transaction info string
	txInfoStr, goErr = txInfoObj.GetTxInfo()
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	return txInfoStr, ""
}

//export SignUpdateLeverage
func SignUpdateLeverage(clientIndex, accountIndex, market, leverage string) (txInfo string, err string) {
	var goErr error
	var txInfoStr string

	defer func() {
		if r := recover(); r != nil {
			goErr = fmt.Errorf("%v", r)
		}
		if goErr != nil {
			err = wrapErr(goErr)
		}
	}()

	if txClient == nil {
		return "", wrapErr(fmt.Errorf("client not initialized"))
	}

	// Parse parameters
	marketIdx, goErr := strconv.ParseUint(market, 10, 8)
	if goErr != nil {
		return "", wrapErr(fmt.Errorf("invalid market index: %s", market))
	}
	
	leverageInt, goErr := strconv.ParseInt(leverage, 10, 64)
	if goErr != nil {
		return "", wrapErr(fmt.Errorf("invalid leverage: %s", leverage))
	}

	// Create update leverage request
	updateLeverageReq := &types.UpdateLeverageTxReq{
		MarketIndex:           uint8(marketIdx),
		InitialMarginFraction: uint16(leverageInt),
		MarginMode:            0, // Default margin mode
	}

	// Get the transaction
	txInfoObj, goErr := txClient.GetUpdateLeverageTransaction(updateLeverageReq, nil)
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	// Get the transaction info string
	txInfoStr, goErr = txInfoObj.GetTxInfo()
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	return txInfoStr, ""
}

//export SignCancelAllOrders
func SignCancelAllOrders(clientIndex, accountIndex, market string) (txInfo string, err string) {
	var goErr error
	var txInfoStr string

	defer func() {
		if r := recover(); r != nil {
			goErr = fmt.Errorf("%v", r)
		}
		if goErr != nil {
			err = wrapErr(goErr)
		}
	}()

	if txClient == nil {
		return "", wrapErr(fmt.Errorf("client not initialized"))
	}

	// Create cancel all orders request
	cancelAllReq := &types.CancelAllOrdersTxReq{
		TimeInForce: 0, // Default time in force
		Time:        0, // Default time
	}

	// Get the transaction
	txInfoObj, goErr := txClient.GetCancelAllOrdersTransaction(cancelAllReq, nil)
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	// Get the transaction info string
	txInfoStr, goErr = txInfoObj.GetTxInfo()
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	return txInfoStr, ""
}

//export CreateAuthToken
func CreateAuthToken(deadline string) (token string, err string) {
	var goErr error
	var tokenStr string

	defer func() {
		if r := recover(); r != nil {
			goErr = fmt.Errorf("%v", r)
		}
		if goErr != nil {
			err = wrapErr(goErr)
		}
	}()

	if txClient == nil {
		return "", wrapErr(fmt.Errorf("client not initialized"))
	}

	// Parse deadline
	deadlineInt, goErr := strconv.ParseInt(deadline, 10, 64)
	if goErr != nil {
		return "", wrapErr(fmt.Errorf("invalid deadline: %s", deadline))
	}

	// Create auth token
	deadlineTime := time.Unix(deadlineInt, 0)
	tokenStr, goErr = txClient.GetAuthToken(deadlineTime)
	if goErr != nil {
		return "", wrapErr(goErr)
	}

	return tokenStr, ""
}

//export CheckClient
func CheckClient(clientIndex, accountIndex string) (err string) {
	var goErr error

	defer func() {
		if r := recover(); r != nil {
			goErr = fmt.Errorf("%v", r)
		}
		if goErr != nil {
			err = wrapErr(goErr)
		}
	}()

	if txClient == nil {
		return wrapErr(fmt.Errorf("client not initialized"))
	}

	// Check if client is valid
	if txClient.GetKeyManager() == nil {
		return wrapErr(fmt.Errorf("client key manager is nil"))
	}

	return ""
}

func main() {
    // Register JS-accessible wrappers for standalone Node usage
    // These avoid HTTP by requiring nonce and setting transact opts explicitly

    js.Global().Set("CreateClient", js.FuncOf(func(this js.Value, args []js.Value) any {
        defer func() {
            if r := recover(); r != nil {
                // return error below via map
            }
        }()

        if len(args) < 4 {
            return js.ValueOf(map[string]any{"error": "CreateClient expects 4 args: apiKey, accountIndex, apiKeyIndex, chainId"})
        }

        apiKey := args[0].String()
        accIdx := int64(args[1].Int())
        apiKeyIdx := uint8(args[2].Int())
        chainId := uint32(args[3].Int())

        // Create client without HTTP
        tx, err := client.NewTxClient(nil, apiKey, accIdx, apiKeyIdx, chainId)
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        txClient = tx
        return js.ValueOf(map[string]any{"error": ""})
    }))

    js.Global().Set("GenerateAPIKey", js.FuncOf(func(this js.Value, args []js.Value) any {
        // Placeholder deterministic pair based on seed for now
        var seed string
        if len(args) > 0 {
            seed = args[0].String()
        } else {
            seed = ""
        }
        priv, pub, errStr := GenerateAPIKey(seed)
        return js.ValueOf(map[string]any{
            "privateKey": priv,
            "publicKey": pub,
            "error":     errStr,
        })
    }))

    js.Global().Set("SignCreateOrder", js.FuncOf(func(this js.Value, args []js.Value) any {
        if txClient == nil {
            return js.ValueOf(map[string]any{"error": "client not initialized"})
        }
        if len(args) < 11 {
            return js.ValueOf(map[string]any{"error": "SignCreateOrder expects 11 args"})
        }

        marketIndex := uint8(args[0].Int())
        clientOrderIndex := int64(args[1].Int())
        baseAmount := int64(args[2].Int())
        price := uint32(args[3].Int())
        isAsk := uint8(args[4].Int())
        orderType := uint8(args[5].Int())
        timeInForce := uint8(args[6].Int())
        reduceOnly := uint8(args[7].Int())
        triggerPrice := uint32(args[8].Int())
        orderExpiry := int64(args[9].Int())
        nonce := int64(args[10].Int())

        req := &types.CreateOrderTxReq{
            MarketIndex:      marketIndex,
            ClientOrderIndex: clientOrderIndex,
            BaseAmount:       baseAmount,
            Price:            price,
            IsAsk:            isAsk,
            Type:             orderType,
            TimeInForce:      timeInForce,
            ReduceOnly:       reduceOnly,
            TriggerPrice:     triggerPrice,
            OrderExpiry:      orderExpiry,
        }

        fromAcc := txClient.GetAccountIndex()
        apiIdx := txClient.GetApiKeyIndex()
        ops := &types.TransactOpts{
            FromAccountIndex: &fromAcc,
            ApiKeyIndex:      &apiIdx,
            Nonce:            &nonce,
        }

        txInfoObj, err := txClient.GetCreateOrderTransaction(req, ops)
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        txInfoStr, err := txInfoObj.GetTxInfo()
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        return js.ValueOf(map[string]any{"txInfo": txInfoStr, "error": ""})
    }))

    js.Global().Set("SignCancelOrder", js.FuncOf(func(this js.Value, args []js.Value) any {
        if txClient == nil {
            return js.ValueOf(map[string]any{"error": "client not initialized"})
        }
        if len(args) < 3 {
            return js.ValueOf(map[string]any{"error": "SignCancelOrder expects 3 args"})
        }

        marketIndex := uint8(args[0].Int())
        orderIndex := int64(args[1].Int())
        nonce := int64(args[2].Int())

        req := &types.CancelOrderTxReq{
            MarketIndex: marketIndex,
            Index:       orderIndex,
        }
        fromAcc := txClient.GetAccountIndex()
        apiIdx := txClient.GetApiKeyIndex()
        ops := &types.TransactOpts{
            FromAccountIndex: &fromAcc,
            ApiKeyIndex:      &apiIdx,
            Nonce:            &nonce,
        }

        txInfoObj, err := txClient.GetCancelOrderTransaction(req, ops)
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        txInfoStr, err := txInfoObj.GetTxInfo()
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        return js.ValueOf(map[string]any{"txInfo": txInfoStr, "error": ""})
    }))

    js.Global().Set("SignCancelAllOrders", js.FuncOf(func(this js.Value, args []js.Value) any {
        if txClient == nil {
            return js.ValueOf(map[string]any{"error": "client not initialized"})
        }
        if len(args) < 3 {
            return js.ValueOf(map[string]any{"error": "SignCancelAllOrders expects 3 args"})
        }

        timeInForce := uint8(args[0].Int())
        timeVal := int64(args[1].Int())
        nonce := int64(args[2].Int())

        req := &types.CancelAllOrdersTxReq{
            TimeInForce: timeInForce,
            Time:        timeVal,
        }
        fromAcc := txClient.GetAccountIndex()
        apiIdx := txClient.GetApiKeyIndex()
        ops := &types.TransactOpts{
            FromAccountIndex: &fromAcc,
            ApiKeyIndex:      &apiIdx,
            Nonce:            &nonce,
        }

        txInfoObj, err := txClient.GetCancelAllOrdersTransaction(req, ops)
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        txInfoStr, err := txInfoObj.GetTxInfo()
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        return js.ValueOf(map[string]any{"txInfo": txInfoStr, "error": ""})
    }))

    js.Global().Set("SignTransfer", js.FuncOf(func(this js.Value, args []js.Value) any {
        if txClient == nil {
            return js.ValueOf(map[string]any{"error": "client not initialized"})
        }
        if len(args) < 5 {
            return js.ValueOf(map[string]any{"error": "SignTransfer expects 5 args"})
        }

        toAccount := int64(args[0].Int())
        usdcAmount := int64(args[1].Int())
        fee := int64(args[2].Int())
        _ = fee // fee currently unused in tx type builder; kept for compatibility
        memoStr := args[3].String()
        nonce := int64(args[4].Int())

        var memoArr [32]byte
        bs := []byte(memoStr)
        for i := 0; i < len(bs) && i < 32; i++ {
            memoArr[i] = bs[i]
        }

        req := &types.TransferTxReq{
            ToAccountIndex: toAccount,
            USDCAmount:     usdcAmount,
            Fee:            0,
            Memo:           memoArr,
        }
        fromAcc := txClient.GetAccountIndex()
        apiIdx := txClient.GetApiKeyIndex()
        ops := &types.TransactOpts{
            FromAccountIndex: &fromAcc,
            ApiKeyIndex:      &apiIdx,
            Nonce:            &nonce,
        }

        txInfoObj, err := txClient.GetTransferTransaction(req, ops)
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        txInfoStr, err := txInfoObj.GetTxInfo()
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        return js.ValueOf(map[string]any{"txInfo": txInfoStr, "error": ""})
    }))

    js.Global().Set("SignUpdateLeverage", js.FuncOf(func(this js.Value, args []js.Value) any {
        if txClient == nil {
            return js.ValueOf(map[string]any{"error": "client not initialized"})
        }
        if len(args) < 4 {
            return js.ValueOf(map[string]any{"error": "SignUpdateLeverage expects 4 args"})
        }

        marketIndex := uint8(args[0].Int())
        fraction := uint16(args[1].Int())
        marginMode := uint8(args[2].Int())
        nonce := int64(args[3].Int())

        req := &types.UpdateLeverageTxReq{
            MarketIndex:           marketIndex,
            InitialMarginFraction: fraction,
            MarginMode:            marginMode,
        }
        fromAcc := txClient.GetAccountIndex()
        apiIdx := txClient.GetApiKeyIndex()
        ops := &types.TransactOpts{
            FromAccountIndex: &fromAcc,
            ApiKeyIndex:      &apiIdx,
            Nonce:            &nonce,
        }

        txInfoObj, err := txClient.GetUpdateLeverageTransaction(req, ops)
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        txInfoStr, err := txInfoObj.GetTxInfo()
        if err != nil {
            return js.ValueOf(map[string]any{"error": wrapErr(err)})
        }
        return js.ValueOf(map[string]any{"txInfo": txInfoStr, "error": ""})
    }))

    js.Global().Set("CreateAuthToken", js.FuncOf(func(this js.Value, args []js.Value) any {
        if txClient == nil {
            return js.ValueOf(map[string]any{"error": "client not initialized"})
        }
        var deadlineInt int64
        if len(args) > 0 {
            if args[0].Type() == js.TypeNumber {
                deadlineInt = int64(args[0].Int())
            } else {
                deadlineInt = time.Now().Add(10 * time.Minute).Unix()
            }
        } else {
            deadlineInt = time.Now().Add(10 * time.Minute).Unix()
        }
        token, errStr := CreateAuthToken(strconv.FormatInt(deadlineInt, 10))
        if errStr != "" {
            return js.ValueOf(map[string]any{"error": errStr})
        }
        return js.ValueOf(map[string]any{"authToken": token, "error": ""})
    }))

    js.Global().Set("CheckClient", js.FuncOf(func(this js.Value, args []js.Value) any {
        errStr := CheckClient("0", "0")
        return js.ValueOf(map[string]any{"error": errStr})
    }))

    // Keep the Go program running
    select {}
}
