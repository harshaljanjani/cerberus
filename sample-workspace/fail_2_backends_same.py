import sys
import numpy as np
import keras
import torch

# CONTEXT: This script simulates a developer who is used to PyTorch and accidentally leaks a torch-specific operation into a Keras model.
class HybridLayer(keras.layers.Layer):
    def __init__(self, units=32):
        super().__init__()
        self.units = units

    def call(self, inputs):
        # === THE CULPRIT ===
        # `torch.sin` works natively on PyTorch tensors; the correct fix would be: return keras.ops.sin(inputs).
        return torch.sin(inputs)

def main():
    inputs = keras.Input(shape=(10,))
    outputs = HybridLayer()(inputs)
    model = keras.Model(inputs, outputs)
    try:
        data = np.random.random((1, 10)).astype("float32")
        _ = model(data)
        print(f"SUCCESS: Model compiled and ran on {keras.config.backend()}")
    except Exception as e:
        print(f"FAILURE on {keras.config.backend()}: {e}", file=sys.stderr)
        raise e

main()
