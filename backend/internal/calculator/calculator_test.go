package calculator_test

import (
	"errors"
	"math"
	"testing"

	"github.com/Js-Meneses/fullstack-calculator/backend/internal/calculator"
)

func TestCalculateResults(t *testing.T) {
	tests := []struct {
		name      string
		operation string
		operands  []float64
		want      float64
	}{
		{"add integers", "add", []float64{2, 3}, 5},
		{"add negatives", "add", []float64{-2.5, -0.5}, -3},
		{"add keeps raw float64", "add", []float64{0.1, 0.2}, 0.30000000000000004},
		{"subtract", "subtract", []float64{2, 5}, -3},
		{"subtract fractions", "subtract", []float64{7.5, 0.25}, 7.25},
		{"multiply", "multiply", []float64{4, 2.5}, 10},
		{"multiply negatives", "multiply", []float64{-3, -4}, 12},
		{"divide", "divide", []float64{7, 2}, 3.5},
		{"divide negative", "divide", []float64{-9, 3}, -3},
		{"divide zero numerator", "divide", []float64{0, 5}, 0},
		{"power", "power", []float64{2, 10}, 1024},
		{"power negative exponent", "power", []float64{2, -2}, 0.25},
		{"power fractional exponent", "power", []float64{9, 0.5}, 3},
		{"power negative base integer exponent", "power", []float64{-2, 3}, -8},
		{"power zero to zero", "power", []float64{0, 0}, 1},
		{"power zero base positive exponent", "power", []float64{0, 3}, 0},
		{"sqrt", "sqrt", []float64{9}, 3},
		{"sqrt fraction", "sqrt", []float64{0.25}, 0.5},
		{"sqrt zero", "sqrt", []float64{0}, 0},
		{"percentage", "percentage", []float64{50, 10}, 5},
		{"percentage multiplies first", "percentage", []float64{7, 3}, 0.21},
		{"percentage over 100", "percentage", []float64{150, 20}, 30},
		{"power underflows to zero", "power", []float64{2, -2000}, 0},
		{"multiply underflows to zero", "multiply", []float64{1e-200, 1e-200}, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calculator.Calculate(tt.operation, tt.operands)
			if err != nil {
				t.Fatalf("Calculate(%q, %v) error = %v, want nil", tt.operation, tt.operands, err)
			}
			if got != tt.want {
				t.Errorf("Calculate(%q, %v) = %v, want %v", tt.operation, tt.operands, got, tt.want)
			}
		})
	}
}

func TestCalculateNegativeZeroBecomesZero(t *testing.T) {
	negZero := math.Copysign(0, -1)
	tests := []struct {
		name      string
		operation string
		operands  []float64
	}{
		{"add negative zeros", "add", []float64{negZero, negZero}},
		{"subtract", "subtract", []float64{negZero, 0}},
		{"multiply", "multiply", []float64{-1, 0}},
		{"divide", "divide", []float64{0, -5}},
		{"power", "power", []float64{negZero, 3}},
		{"sqrt", "sqrt", []float64{negZero}},
		{"percentage", "percentage", []float64{-5, 0}},
		{"underflow", "multiply", []float64{-1e-200, 1e-200}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calculator.Calculate(tt.operation, tt.operands)
			if err != nil {
				t.Fatalf("Calculate(%q, %v) error = %v, want nil", tt.operation, tt.operands, err)
			}
			if got != 0 || math.Signbit(got) {
				t.Errorf("Calculate(%q, %v) = %v (signbit %t), want +0", tt.operation, tt.operands, got, math.Signbit(got))
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	negZero := math.Copysign(0, -1)
	tests := []struct {
		name      string
		operation string
		operands  []float64
		wantErr   error
	}{
		{"unknown operation", "modulo", []float64{1, 2}, calculator.ErrUnknownOperation},
		{"empty operation", "", []float64{1, 2}, calculator.ErrUnknownOperation},
		{"operation is case-sensitive", "Add", []float64{1, 2}, calculator.ErrUnknownOperation},
		{"unknown operation checked before count", "modulo", nil, calculator.ErrUnknownOperation},

		{"add with nil operands", "add", nil, calculator.ErrOperandCount},
		{"add with one operand", "add", []float64{1}, calculator.ErrOperandCount},
		{"add with three operands", "add", []float64{1, 2, 3}, calculator.ErrOperandCount},
		{"subtract with one operand", "subtract", []float64{1}, calculator.ErrOperandCount},
		{"multiply with three operands", "multiply", []float64{1, 2, 3}, calculator.ErrOperandCount},
		{"divide with one operand", "divide", []float64{0}, calculator.ErrOperandCount},
		{"power with one operand", "power", []float64{2}, calculator.ErrOperandCount},
		{"sqrt with no operands", "sqrt", []float64{}, calculator.ErrOperandCount},
		{"sqrt with two operands", "sqrt", []float64{-4, 2}, calculator.ErrOperandCount},
		{"percentage with one operand", "percentage", []float64{50}, calculator.ErrOperandCount},

		{"divide by zero", "divide", []float64{1, 0}, calculator.ErrDivisionByZero},
		{"divide by negative zero", "divide", []float64{1, negZero}, calculator.ErrDivisionByZero},
		{"divide zero by zero", "divide", []float64{0, 0}, calculator.ErrDivisionByZero},
		{"power zero base negative exponent", "power", []float64{0, -1}, calculator.ErrDivisionByZero},
		{"power negative zero base negative exponent", "power", []float64{negZero, -0.5}, calculator.ErrDivisionByZero},

		{"sqrt of negative", "sqrt", []float64{-1}, calculator.ErrNegativeSquareRoot},
		{"sqrt of small negative", "sqrt", []float64{-1e-300}, calculator.ErrNegativeSquareRoot},

		{"multiply overflows to +Inf", "multiply", []float64{1e308, 10}, calculator.ErrOutOfRange},
		{"multiply overflows to -Inf", "multiply", []float64{-1e308, 10}, calculator.ErrOutOfRange},
		{"add overflows", "add", []float64{math.MaxFloat64, math.MaxFloat64}, calculator.ErrOutOfRange},
		{"subtract overflows", "subtract", []float64{-math.MaxFloat64, math.MaxFloat64}, calculator.ErrOutOfRange},
		{"divide overflows", "divide", []float64{1e308, 1e-10}, calculator.ErrOutOfRange},
		{"power overflows", "power", []float64{10, 400}, calculator.ErrOutOfRange},
		{"percentage overflows in the product", "percentage", []float64{1e307, 1000}, calculator.ErrOutOfRange},

		{"power of negative base and fractional exponent", "power", []float64{-8, 0.5}, calculator.ErrUndefinedResult},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calculator.Calculate(tt.operation, tt.operands)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Calculate(%q, %v) error = %v, want %v", tt.operation, tt.operands, err, tt.wantErr)
			}
			if got != 0 {
				t.Errorf("Calculate(%q, %v) = %v alongside an error, want 0", tt.operation, tt.operands, got)
			}
		})
	}
}
