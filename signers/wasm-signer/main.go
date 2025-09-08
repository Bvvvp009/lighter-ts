package main

import (
	"encoding/json"
	"syscall/js"
	"time"
	"crypto/rand"
	"encoding/hex"
)

// Simplified structures for WASM signer
type CreateOrderTxReq struct {
	MarketIndex      uint8  `json:"marketIndex"`
	ClientOrderIndex int64  `json:"clientOrderIndex"`
	BaseAmount       int64  `json:"baseAmount"`
	Price            uint32 `json:"price"`
	IsAsk            uint8  `json:"isAsk"`
	Type             uint8  `json:"type"`
	TimeInForce      uint8  `json:"timeInForce"`
	ReduceOnly       uint8  `json:"reduceOnly"`
	TriggerPrice     uint32 `json:"triggerPrice"`
	OrderExpiry      int64  `json:"orderExpiry"`
	Nonce            int64  `json:"nonce"`
	AccountIndex     int64  `json:"accountIndex"`
	ApiKeyIndex      uint8  `json:"apiKeyIndex"`
}

type CancelOrderTxReq struct {
	MarketIndex  uint8 `json:"marketIndex"`
	Index        int64 `json:"index"`
	Nonce        int64 `json:"nonce"`
	AccountIndex int64 `json:"accountIndex"`
	ApiKeyIndex  uint8 `json:"apiKeyIndex"`
}

// Simple mock implementations for demonstration
func generateAPIKey(this js.Value, args []js.Value) interface{} {
	// Generate a random private key (32 bytes)
	privateKeyBytes := make([]byte, 32)
	rand.Read(privateKeyBytes)
	privateKey := hex.EncodeToString(privateKeyBytes)
	
	// Generate a simple public key (for demo purposes)
	publicKeyBytes := make([]byte, 32)
	rand.Read(publicKeyBytes)
	publicKey := hex.EncodeToString(publicKeyBytes)
	
	return map[string]interface{}{
		"privateKey": privateKey,
		"publicKey":  publicKey,
	}
}

func createClient(this js.Value, args []js.Value) interface{} {
	if len(args) < 5 {
		return map[string]interface{}{
			"error": "insufficient arguments",
		}
	}
	
	// For demo purposes, just return success
	return map[string]interface{}{
		"success": true,
	}
}

func signCreateOrder(this js.Value, args []js.Value) interface{} {
	if len(args) < 11 {
		return map[string]interface{}{
			"error": "insufficient arguments",
		}
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
	
	if orderExpiry == -1 {
		orderExpiry = time.Now().Add(time.Hour * 24 * 28).UnixMilli() // 28 days
	}
	
	txInfo := &CreateOrderTxReq{
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
		Nonce:            nonce,
		AccountIndex:     1, // Default values for demo
		ApiKeyIndex:      1,
	}
	
	txInfoBytes, err := json.Marshal(txInfo)
	if err != nil {
		return map[string]interface{}{
			"error": err.Error(),
		}
	}
	
	return map[string]interface{}{
		"txInfo": string(txInfoBytes),
	}
}

func signCancelOrder(this js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return map[string]interface{}{
			"error": "insufficient arguments",
		}
	}
	
	marketIndex := uint8(args[0].Int())
	orderIndex := int64(args[1].Int())
	nonce := int64(args[2].Int())
	
	txInfo := &CancelOrderTxReq{
		MarketIndex:  marketIndex,
		Index:        orderIndex,
		Nonce:        nonce,
		AccountIndex: 1, // Default values for demo
		ApiKeyIndex:  1,
	}
	
	txInfoBytes, err := json.Marshal(txInfo)
	if err != nil {
		return map[string]interface{}{
			"error": err.Error(),
		}
	}
	
	return map[string]interface{}{
		"txInfo": string(txInfoBytes),
	}
}

func createAuthToken(this js.Value, args []js.Value) interface{} {
	deadline := int64(0)
	if len(args) > 0 && !args[0].IsNull() && !args[0].IsUndefined() {
		deadline = int64(args[0].Int())
	}
	if deadline == 0 {
		deadline = time.Now().Add(time.Hour * 7).Unix()
	}
	
	// Generate a simple auth token for demo
	authTokenBytes := make([]byte, 32)
	rand.Read(authTokenBytes)
	authToken := hex.EncodeToString(authTokenBytes)
	
	return map[string]interface{}{
		"authToken": authToken,
	}
}

func registerCallbacks() {
	js.Global().Set("generateAPIKey", js.FuncOf(generateAPIKey))
	js.Global().Set("createClient", js.FuncOf(createClient))
	js.Global().Set("signCreateOrder", js.FuncOf(signCreateOrder))
	js.Global().Set("signCancelOrder", js.FuncOf(signCancelOrder))
	js.Global().Set("createAuthToken", js.FuncOf(createAuthToken))
}

func main() {
	c := make(chan struct{}, 0)
	registerCallbacks()
	<-c
}