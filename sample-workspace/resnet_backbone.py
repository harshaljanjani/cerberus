# Taken from https://github.com/keras-team/keras-hub/blob/v0.23.0/keras_hub/src/models/resnet/resnet_backbone.py.

import keras
from keras import layers
from keras import ops

from keras_hub.src.api_export import keras_hub_export
from keras_hub.src.models.feature_pyramid_backbone import FeaturePyramidBackbone
from keras_hub.src.utils.keras_utils import standardize_data_format


@keras_hub_export("keras_hub.models.ResNetBackbone")
class ResNetBackbone(FeaturePyramidBackbone):
    def __init__(
        self,
        input_conv_filters,
        input_conv_kernel_sizes,
        stackwise_num_filters,
        stackwise_num_blocks,
        stackwise_num_strides,
        block_type,
        use_pre_activation=False,
        image_shape=(None, None, 3),
        data_format=None,
        dtype=None,
        **kwargs,
    ):
        if len(input_conv_filters) != len(input_conv_kernel_sizes):
            raise ValueError(
                "The length of `input_conv_filters` and"
                "`input_conv_kernel_sizes` must be the same. "
                f"Received: input_conv_filters={input_conv_filters}, "
                f"input_conv_kernel_sizes={input_conv_kernel_sizes}."
            )
        if len(stackwise_num_filters) != len(stackwise_num_blocks) or len(
            stackwise_num_filters
        ) != len(stackwise_num_strides):
            raise ValueError(
                "The length of `stackwise_num_filters`, `stackwise_num_blocks` "
                "and `stackwise_num_strides` must be the same. Received: "
                f"stackwise_num_filters={stackwise_num_filters}, "
                f"stackwise_num_blocks={stackwise_num_blocks}, "
                f"stackwise_num_strides={stackwise_num_strides}"
            )
        if stackwise_num_filters[0] != 64:
            raise ValueError(
                "The first element of `stackwise_num_filters` must be 64. "
                f"Received: stackwise_num_filters={stackwise_num_filters}"
            )
        if block_type not in (
            "basic_block",
            "bottleneck_block",
            "basic_block_vd",
            "bottleneck_block_vd",
        ):
            raise ValueError(
                '`block_type` must be either `"basic_block"`, '
                '`"bottleneck_block"`, `"basic_block_vd"` or '
                f'`"bottleneck_block_vd"`. Received block_type={block_type}.'
            )
        data_format = standardize_data_format(data_format)
        bn_axis = -1 if data_format == "channels_last" else 1
        num_input_convs = len(input_conv_filters)
        num_stacks = len(stackwise_num_filters)

        # === Functional Model ===
        image_input = layers.Input(shape=image_shape)
        x = image_input  # Intermediate result.
        # The padding between torch and tensorflow/jax differs when `strides>1`.
        # Therefore, we need to manually pad the tensor.
        x = layers.ZeroPadding2D(
            (input_conv_kernel_sizes[0] - 1) // 2,
            data_format=data_format,
            dtype=dtype,
            name="conv1_pad",
        )(x)
        x = layers.Conv2D(
            input_conv_filters[0],
            input_conv_kernel_sizes[0],
            strides=2,
            data_format=data_format,
            use_bias=False,
            padding="valid",
            dtype=dtype,
            name="conv1_conv",
        )(x)
        for conv_index in range(1, num_input_convs):
            x = layers.BatchNormalization(
                axis=bn_axis,
                epsilon=1e-5,
                momentum=0.9,
                dtype=dtype,
                name=f"conv{conv_index}_bn",
            )(x)
            x = layers.Activation(
                "relu", dtype=dtype, name=f"conv{conv_index}_relu"
            )(x)
            x = layers.Conv2D(
                input_conv_filters[conv_index],
                input_conv_kernel_sizes[conv_index],
                strides=1,
                data_format=data_format,
                use_bias=False,
                padding="same",
                dtype=dtype,
                name=f"conv{conv_index + 1}_conv",
            )(x)

        if not use_pre_activation:
            x = layers.BatchNormalization(
                axis=bn_axis,
                epsilon=1e-5,
                momentum=0.9,
                dtype=dtype,
                name=f"conv{num_input_convs}_bn",
            )(x)
            x = layers.Activation(
                "relu",
                dtype=dtype,
                name=f"conv{num_input_convs}_relu",
            )(x)

        if use_pre_activation:
            # A workaround for ResNetV2: we need -inf padding to prevent zeros
            # from being the max values in the following `MaxPooling2D`.
            pad_width = [[1, 1], [1, 1]]
            if data_format == "channels_last":
                pad_width += [[0, 0]]
            else:
                pad_width = [[0, 0]] + pad_width
            pad_width = [[0, 0]] + pad_width
            x = ops.pad(x, pad_width=pad_width, constant_values=float("-inf"))
        else:
            x = layers.ZeroPadding2D(
                1, data_format=data_format, dtype=dtype, name="pool1_pad"
            )(x)
        x = layers.MaxPooling2D(
            3,
            strides=2,
            data_format=data_format,
            dtype=dtype,
            name="pool1_pool",
        )(x)

        pyramid_outputs = {}
        for stack_index in range(num_stacks):
            x = apply_stack(
                x,
                filters=stackwise_num_filters[stack_index],
                blocks=stackwise_num_blocks[stack_index],
                stride=stackwise_num_strides[stack_index],
                block_type=block_type,
                use_pre_activation=use_pre_activation,
                first_shortcut=(block_type != "basic_block" or stack_index > 0),
                data_format=data_format,
                dtype=dtype,
                name=f"stack{stack_index}",
            )
            pyramid_outputs[f"P{stack_index + 2}"] = x

        if use_pre_activation:
            x = layers.BatchNormalization(
                axis=bn_axis,
                epsilon=1e-5,
                momentum=0.9,
                dtype=dtype,
                name="post_bn",
            )(x)
            x = layers.Activation("relu", dtype=dtype, name="post_relu")(x)

        super().__init__(
            inputs=image_input,
            outputs=x,
            dtype=dtype,
            **kwargs,
        )

        # === Config ===
        self.input_conv_filters = input_conv_filters
        self.input_conv_kernel_sizes = input_conv_kernel_sizes
        self.stackwise_num_filters = stackwise_num_filters
        self.stackwise_num_blocks = stackwise_num_blocks
        self.stackwise_num_strides = stackwise_num_strides
        self.block_type = block_type
        self.use_pre_activation = use_pre_activation
        self.image_shape = image_shape
        self.pyramid_outputs = pyramid_outputs
        self.data_format = data_format

    def get_config(self):
        config = super().get_config()
        config.update(
            {
                "input_conv_filters": self.input_conv_filters,
                "input_conv_kernel_sizes": self.input_conv_kernel_sizes,
                "stackwise_num_filters": self.stackwise_num_filters,
                "stackwise_num_blocks": self.stackwise_num_blocks,
                "stackwise_num_strides": self.stackwise_num_strides,
                "block_type": self.block_type,
                "use_pre_activation": self.use_pre_activation,
                "image_shape": self.image_shape,
            }
        )
        return config


def apply_basic_block(
    x,
    filters,
    kernel_size=3,
    stride=1,
    conv_shortcut=False,
    use_pre_activation=False,
    data_format=None,
    dtype=None,
    name=None,
):
    data_format = data_format or keras.config.image_data_format()
    bn_axis = -1 if data_format == "channels_last" else 1

    x_preact = None
    if use_pre_activation:
        x_preact = layers.BatchNormalization(
            axis=bn_axis,
            epsilon=1e-5,
            momentum=0.9,
            dtype=dtype,
            name=f"{name}_pre_activation_bn",
        )(x)
        x_preact = layers.Activation(
            "relu", dtype=dtype, name=f"{name}_pre_activation_relu"
        )(x_preact)

    if conv_shortcut:
        if x_preact is not None:
            shortcut = x_preact
        else:
            shortcut = x
        shortcut = layers.Conv2D(
            filters,
            1,
            strides=stride,
            data_format=data_format,
            use_bias=False,
            dtype=dtype,
            name=f"{name}_0_conv",
        )(shortcut)
        if not use_pre_activation:
            shortcut = layers.BatchNormalization(
                axis=bn_axis,
                epsilon=1e-5,
                momentum=0.9,
                dtype=dtype,
                name=f"{name}_0_bn",
            )(shortcut)
    else:
        shortcut = x

    x = x_preact if x_preact is not None else x
    if stride > 1:
        x = layers.ZeroPadding2D(
            (kernel_size - 1) // 2,
            data_format=data_format,
            dtype=dtype,
            name=f"{name}_1_pad",
        )(x)
    x = layers.Conv2D(
        filters,
        kernel_size,
        strides=stride,
        padding="valid" if stride > 1 else "same",
        data_format=data_format,
        use_bias=False,
        dtype=dtype,
        name=f"{name}_1_conv",
    )(x)
    x = layers.BatchNormalization(
        axis=bn_axis,
        epsilon=1e-5,
        momentum=0.9,
        dtype=dtype,
        name=f"{name}_1_bn",
    )(x)
    x = layers.Activation("relu", dtype=dtype, name=f"{name}_1_relu")(x)

    x = layers.Conv2D(
        filters,
        kernel_size,
        strides=1,
        padding="same",
        data_format=data_format,
        use_bias=False,
        dtype=dtype,
        name=f"{name}_2_conv",
    )(x)
    if not use_pre_activation:
        x = layers.BatchNormalization(
            axis=bn_axis,
            epsilon=1e-5,
            momentum=0.9,
            dtype=dtype,
            name=f"{name}_2_bn",
        )(x)
        x = layers.Add(dtype=dtype, name=f"{name}_add")([shortcut, x])
        x = layers.Activation("relu", dtype=dtype, name=f"{name}_out")(x)
    else:
        x = layers.Add(dtype=dtype, name=f"{name}_out")([shortcut, x])
    return x


def apply_bottleneck_block(
    x,
    filters,
    kernel_size=3,
    stride=1,
    conv_shortcut=False,
    use_pre_activation=False,
    data_format=None,
    dtype=None,
    name=None,
):
    data_format = data_format or keras.config.image_data_format()
    bn_axis = -1 if data_format == "channels_last" else 1

    x_preact = None
    if use_pre_activation:
        x_preact = layers.BatchNormalization(
            axis=bn_axis,
            epsilon=1e-5,
            momentum=0.9,
            dtype=dtype,
            name=f"{name}_pre_activation_bn",
        )(x)
        x_preact = layers.Activation(
            "relu", dtype=dtype, name=f"{name}_pre_activation_relu"
        )(x_preact)

    if conv_shortcut:
        if x_preact is not None:
            shortcut = x_preact
        else:
            shortcut = x
        shortcut = layers.Conv2D(
            4 * filters,
            1,
            strides=stride,
            data_format=data_format,
            use_bias=False,
            dtype=dtype,
            name=f"{name}_0_conv",
        )(shortcut)
        if not use_pre_activation:
            shortcut = layers.BatchNormalization(
                axis=bn_axis,
                epsilon=1e-5,
                momentum=0.9,
                dtype=dtype,
                name=f"{name}_0_bn",
            )(shortcut)
    else:
        shortcut = x

    x = x_preact if x_preact is not None else x
    x = layers.Conv2D(
        filters,
        1,
        strides=1,
        data_format=data_format,
        use_bias=False,
        dtype=dtype,
        name=f"{name}_1_conv",
    )(x)
    x = layers.BatchNormalization(
        axis=bn_axis,
        epsilon=1e-5,
        momentum=0.9,
        dtype=dtype,
        name=f"{name}_1_bn",
    )(x)
    x = layers.Activation("relu", dtype=dtype, name=f"{name}_1_relu")(x)

    if stride > 1:
        x = layers.ZeroPadding2D(
            (kernel_size - 1) // 2,
            data_format=data_format,
            dtype=dtype,
            name=f"{name}_2_pad",
        )(x)
    x = layers.Conv2D(
        filters,
        kernel_size,
        strides=stride,
        padding="valid" if stride > 1 else "same",
        data_format=data_format,
        use_bias=False,
        dtype=dtype,
        name=f"{name}_2_conv",
    )(x)
    x = layers.BatchNormalization(
        axis=bn_axis,
        epsilon=1e-5,
        momentum=0.9,
        dtype=dtype,
        name=f"{name}_2_bn",
    )(x)
    x = layers.Activation("relu", dtype=dtype, name=f"{name}_2_relu")(x)

    x = layers.Conv2D(
        4 * filters,
        1,
        data_format=data_format,
        use_bias=False,
        dtype=dtype,
        name=f"{name}_3_conv",
    )(x)
    if not use_pre_activation:
        x = layers.BatchNormalization(
            axis=bn_axis,
            epsilon=1e-5,
            momentum=0.9,
            dtype=dtype,
            name=f"{name}_3_bn",
        )(x)
        x = layers.Add(dtype=dtype, name=f"{name}_add")([shortcut, x])
        x = layers.Activation("relu", dtype=dtype, name=f"{name}_out")(x)
    else:
        x = layers.Add(dtype=dtype, name=f"{name}_out")([shortcut, x])
    return x


def apply_basic_block_vd(
    x,
    filters,
    kernel_size=3,
    stride=1,
    conv_shortcut=False,
    use_pre_activation=False,
    data_format=None,
    dtype=None,
    name=None,
):
    data_format = data_format or keras.config.image_data_format()
    bn_axis = -1 if data_format == "channels_last" else 1

    x_preact = None
    if use_pre_activation:
        x_preact = layers.BatchNormalization(
            axis=bn_axis,
            epsilon=1e-5,
            momentum=0.9,
            dtype=dtype,
            name=f"{name}_pre_activation_bn",
        )(x)
        x_preact = layers.Activation(
            "relu", dtype=dtype, name=f"{name}_pre_activation_relu"
        )(x_preact)

    if conv_shortcut:
        if x_preact is not None:
            shortcut = x_preact
        elif stride > 1:
            shortcut = layers.AveragePooling2D(
                2,
                strides=stride,
                data_format=data_format,
                dtype=dtype,
                padding="same",
            )(x)
        else:
            shortcut = x
        shortcut = layers.Conv2D(
            filters,
            1,
            strides=1,
            data_format=data_format,
            use_bias=False,
            dtype=dtype,
            name=f"{name}_0_conv",
        )(shortcut)
        if not use_pre_activation:
            shortcut = layers.BatchNormalization(
                axis=bn_axis,
                epsilon=1e-5,
                momentum=0.9,
                dtype=dtype,
                name=f"{name}_0_bn",
            )(shortcut)
    else:
        shortcut = x

    x = x_preact if x_preact is not None else x
    if stride > 1:
        x = layers.ZeroPadding2D(
            (kernel_size - 1) // 2,
            data_format=data_format,
            dtype=dtype,
            name=f"{name}_1_pad",
        )(x)
    x = layers.Conv2D(
        filters,
        kernel_size,
        strides=stride,
        padding="valid" if stride > 1 else "same",
        data_format=data_format,
        use_bias=False,
        dtype=dtype,
        name=f"{name}_1_conv",
    )(x)
    x = layers.BatchNormalization(
        axis=bn_axis,
        epsilon=1e-5,
        momentum=0.9,
        dtype=dtype,
        name=f"{name}_1_bn",
    )(x)
    x = layers.Activation("relu", dtype=dtype, name=f"{name}_1_relu")(x)

    x = layers.Conv2D(
        filters,
        kernel_size,
        strides=1,
        padding="same",
        data_format=data_format,
        use_bias=False,
        dtype=dtype,
        name=f"{name}_2_conv",
    )(x)
    if not use_pre_activation:
        x = layers.BatchNormalization(
            axis=bn_axis,
            epsilon=1e-5,
            momentum=0.9,
            dtype=dtype,
            name=f"{name}_2_bn",
        )(x)
        x = layers.Add(dtype=dtype, name=f"{name}_add")([shortcut, x])
        x = layers.Activation("relu", dtype=dtype, name=f"{name}_out")(x)
    else:
        x = layers.Add(dtype=dtype, name=f"{name}_out")([shortcut, x])
    return x


def apply_bottleneck_block_vd(
    x,
    filters,
    kernel_size=3,
    stride=1,
    conv_shortcut=False,
    use_pre_activation=False,
    data_format=None,
    dtype=None,
    name=None,
):
    data_format = data_format or keras.config.image_data_format()
    bn_axis = -1 if data_format == "channels_last" else 1

    x_preact = None
    if use_pre_activation:
        x_preact = layers.BatchNormalization(
            axis=bn_axis,
            epsilon=1e-5,
            momentum=0.9,
            dtype=dtype,
            name=f"{name}_pre_activation_bn",
        )(x)
        x_preact = layers.Activation(
            "relu", dtype=dtype, name=f"{name}_pre_activation_relu"
        )(x_preact)

    if conv_shortcut:
        if x_preact is not None:
            shortcut = x_preact
        elif stride > 1:
            shortcut = layers.AveragePooling2D(
                2,
                strides=stride,
                data_format=data_format,
                dtype=dtype,
                padding="same",
            )(x)
        else:
            shortcut = x
        shortcut = layers.Conv2D(
            4 * filters,
            1,
            strides=1,
            data_format=data_format,
            use_bias=False,
            dtype=dtype,
            name=f"{name}_0_conv",
        )(shortcut)
        if not use_pre_activation:
            shortcut = layers.BatchNormalization(
                axis=bn_axis,
                epsilon=1e-5,
                momentum=0.9,
                dtype=dtype,
                name=f"{name}_0_bn",
            )(shortcut)
    else:
        shortcut = x

    x = x_preact if x_preact is not None else x
    x = layers.Conv2D(
        filters,
        1,
        strides=1,
        data_format=data_format,
        use_bias=False,
        dtype=dtype,
        name=f"{name}_1_conv",
    )(x)
    x = layers.BatchNormalization(
        axis=bn_axis,
        epsilon=1e-5,
        momentum=0.9,
        dtype=dtype,
        name=f"{name}_1_bn",
    )(x)
    x = layers.Activation("relu", dtype=dtype, name=f"{name}_1_relu")(x)

    if stride > 1:
        x = layers.ZeroPadding2D(
            (kernel_size - 1) // 2,
            data_format=data_format,
            dtype=dtype,
            name=f"{name}_2_pad",
        )(x)
    x = layers.Conv2D(
        filters,
        kernel_size,
        strides=stride,
        padding="valid" if stride > 1 else "same",
        data_format=data_format,
        use_bias=False,
        dtype=dtype,
        name=f"{name}_2_conv",
    )(x)
    x = layers.BatchNormalization(
        axis=bn_axis,
        epsilon=1e-5,
        momentum=0.9,
        dtype=dtype,
        name=f"{name}_2_bn",
    )(x)
    x = layers.Activation("relu", dtype=dtype, name=f"{name}_2_relu")(x)

    x = layers.Conv2D(
        4 * filters,
        1,
        data_format=data_format,
        use_bias=False,
        dtype=dtype,
        name=f"{name}_3_conv",
    )(x)
    if not use_pre_activation:
        x = layers.BatchNormalization(
            axis=bn_axis,
            epsilon=1e-5,
            momentum=0.9,
            dtype=dtype,
            name=f"{name}_3_bn",
        )(x)
        x = layers.Add(dtype=dtype, name=f"{name}_add")([shortcut, x])
        x = layers.Activation("relu", dtype=dtype, name=f"{name}_out")(x)
    else:
        x = layers.Add(dtype=dtype, name=f"{name}_out")([shortcut, x])
    return x


def apply_stack(
    x,
    filters,
    blocks,
    stride,
    block_type,
    use_pre_activation,
    first_shortcut=True,
    data_format=None,
    dtype=None,
    name=None,
):
    if name is None:
        name = "stack"

    if block_type == "basic_block":
        block_fn = apply_basic_block
    elif block_type == "bottleneck_block":
        block_fn = apply_bottleneck_block
    elif block_type == "basic_block_vd":
        block_fn = apply_basic_block_vd
    elif block_type == "bottleneck_block_vd":
        block_fn = apply_bottleneck_block_vd
    else:
        raise ValueError(
            '`block_type` must be either `"basic_block"`, '
            '`"bottleneck_block"`, `"basic_block_vd"` or '
            f'`"bottleneck_block_vd"`. Received block_type={block_type}.'
        )
    for i in range(blocks):
        if i == 0:
            stride = stride
            conv_shortcut = first_shortcut
        else:
            stride = 1
            conv_shortcut = False
        x = block_fn(
            x,
            filters,
            stride=stride,
            conv_shortcut=conv_shortcut,
            use_pre_activation=use_pre_activation,
            data_format=data_format,
            dtype=dtype,
            name=f"{name}_block{str(i)}",
        )
    return x
