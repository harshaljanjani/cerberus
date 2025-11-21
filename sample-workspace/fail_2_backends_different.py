import keras

def main():
    backend = keras.config.backend()
    # TensorFlow Failure (Type Error).
    if backend == "tensorflow":
        x = keras.ops.convert_to_tensor(["invalid_string"])
        y = keras.ops.sum(x)
    # JAX Failure: Shape Mismatch.
    elif backend == "jax":
        print("Attempting shape mismatch for JAX...")
        a = keras.ops.ones((2, 2))
        b = keras.ops.ones((3, 3))
        z = keras.ops.matmul(a, b)
    # PyTorch (Pass).
    elif backend == "torch":
        x = keras.ops.ones((2, 2))
        y = keras.ops.sum(x)

if __name__ == "__main__":
    main()
