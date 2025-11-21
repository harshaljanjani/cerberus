import keras

class Processor(keras.layers.Layer):
    def __init__(self):
        super().__init__()

    def call(self, inputs):
        backend = keras.config.backend()
        if backend == "tensorflow":
            raise NotImplementedError(
                f"The preprocessing operation is not yet implemented for the '{backend}' backend."
            )
        return keras.ops.square(inputs)

def main():
    processor = Processor()
    x = keras.ops.ones((2, 2))
    # Will succeed on JAX/Torch but fail on TensorFlow.
    y = processor(x)

if __name__ == "__main__":
    main()
