// Package calculator implements the calculator operations on float64 operands.
// It knows nothing about HTTP or JSON: failures are reported as sentinel errors.
package calculator

import (
	"errors"
	"math"
)

// Sentinel errors returned by Calculate.
var (
	ErrUnknownOperation   = errors.New("unknown operation")
	ErrOperandCount       = errors.New("wrong number of operands")
	ErrDivisionByZero     = errors.New("division by zero")
	ErrNegativeSquareRoot = errors.New("square root of a negative number")
	ErrOutOfRange         = errors.New("result out of range")
	ErrUndefinedResult    = errors.New("undefined result")
)

// operation describes one calculator operation: how many operands it takes,
// an optional check that runs before computing, and the computation itself.
type operation struct {
	arity   int
	check   func(operands []float64) error
	compute func(operands []float64) float64
}

var operations = map[string]operation{
	"add": {
		arity:   2,
		compute: func(o []float64) float64 { return o[0] + o[1] },
	},
	"subtract": {
		arity:   2,
		compute: func(o []float64) float64 { return o[0] - o[1] },
	},
	"multiply": {
		arity:   2,
		compute: func(o []float64) float64 { return o[0] * o[1] },
	},
	"divide": {
		arity: 2,
		check: func(o []float64) error {
			if o[1] == 0 {
				return ErrDivisionByZero
			}
			return nil
		},
		compute: func(o []float64) float64 { return o[0] / o[1] },
	},
	"power": {
		arity: 2,
		check: func(o []float64) error {
			if o[0] == 0 && o[1] < 0 {
				return ErrDivisionByZero
			}
			return nil
		},
		compute: func(o []float64) float64 { return math.Pow(o[0], o[1]) },
	},
	"sqrt": {
		arity: 1,
		check: func(o []float64) error {
			if o[0] < 0 {
				return ErrNegativeSquareRoot
			}
			return nil
		},
		compute: func(o []float64) float64 { return math.Sqrt(o[0]) },
	},
	"percentage": {
		arity: 2,
		// a% of b, multiplied first so that 7% of 3 is exactly 0.21.
		compute: func(o []float64) float64 { return o[0] * o[1] / 100 },
	},
}

// Calculate applies the named operation to the operands.
//
// It checks, in order, that the operation exists, that the operand count
// matches it and that the operation's own precondition holds. A NaN result is
// ErrUndefinedResult, an infinite one is ErrOutOfRange, and -0 is returned as 0.
func Calculate(name string, operands []float64) (float64, error) {
	op, ok := operations[name]
	if !ok {
		return 0, ErrUnknownOperation
	}
	if len(operands) != op.arity {
		return 0, ErrOperandCount
	}
	if op.check != nil {
		if err := op.check(operands); err != nil {
			return 0, err
		}
	}

	result := op.compute(operands)
	switch {
	case math.IsNaN(result):
		return 0, ErrUndefinedResult
	case math.IsInf(result, 0):
		return 0, ErrOutOfRange
	case result == 0:
		return 0, nil // normalizes -0 to 0
	}
	return result, nil
}
