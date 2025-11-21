import keras

def main():
    x = keras.ops.ones((4,))
    # Attempt to reshape 4 elements into a 3x3 matrix (requires 9 elements)
    # This will cause a runtime error on TensorFlow, JAX, and PyTorch.
    y = keras.ops.reshape(x, (3, 3))

if __name__ == "__main__":
    main()
