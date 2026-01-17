use burn::{
    config::Config,
    module::Module,
    nn::{
        conv::{Conv2d, Conv2dConfig, ConvTranspose2d, ConvTranspose2dConfig},
        Linear, LinearConfig, PaddingConfig2d, BatchNorm, BatchNormConfig,
    },
    tensor::{activation::{relu, sigmoid}, backend::Backend, Tensor},
};

#[derive(Module, Debug)]
pub struct Model<B: Backend> {
    encoder: Encoder<B>,
    decoder: Decoder<B>,
    pub width: usize,
    pub height: usize,
}

#[derive(Module, Debug)]
pub struct Encoder<B: Backend> {
    conv1: Conv2d<B>,
    bn1: BatchNorm<B, 2>,
    conv2: Conv2d<B>,
    bn2: BatchNorm<B, 2>,
    conv3: Conv2d<B>,
    bn3: BatchNorm<B, 2>,
    fc: Linear<B>,
}

#[derive(Module, Debug)]
pub struct Decoder<B: Backend> {
    fc: Linear<B>,
    deconv1: ConvTranspose2d<B>,
    bn1: BatchNorm<B, 2>,
    deconv2: ConvTranspose2d<B>,
    bn2: BatchNorm<B, 2>,
    deconv3: ConvTranspose2d<B>,
}

#[derive(Config, Debug)]
pub struct ModelConfig {
    pub latent_dim: usize,
    pub width: usize,
    pub height: usize,
}

impl ModelConfig {
    pub fn init<B: Backend>(&self, device: &B::Device) -> Model<B> {
        let bottleneck_width = self.width / 8;
        let bottleneck_height = self.height / 8;
        let bottleneck_size = bottleneck_width * bottleneck_height * 32;

        Model {
            encoder: Encoder {
                conv1: Conv2dConfig::new([1, 8], [3, 3]).with_stride([2, 2]).with_padding(PaddingConfig2d::Explicit(1, 1)).init(device),
                bn1: BatchNormConfig::new(8).init(device),
                conv2: Conv2dConfig::new([8, 16], [3, 3]).with_stride([2, 2]).with_padding(PaddingConfig2d::Explicit(1, 1)).init(device),
                bn2: BatchNormConfig::new(16).init(device),
                conv3: Conv2dConfig::new([16, 32], [3, 3]).with_stride([2, 2]).with_padding(PaddingConfig2d::Explicit(1, 1)).init(device),
                bn3: BatchNormConfig::new(32).init(device),
                fc: LinearConfig::new(bottleneck_size, self.latent_dim).init(device),
            },
            decoder: Decoder {
                fc: LinearConfig::new(self.latent_dim, bottleneck_size).init(device),
                deconv1: ConvTranspose2dConfig::new([32, 16], [3, 3])
                    .with_stride([2, 2])
                    .with_padding([1, 1])
                    .with_padding_out([1, 1])
                    .init(device),
                bn1: BatchNormConfig::new(16).init(device),
                deconv2: ConvTranspose2dConfig::new([16, 8], [3, 3])
                    .with_stride([2, 2])
                    .with_padding([1, 1])
                    .with_padding_out([1, 1])
                    .init(device),
                bn2: BatchNormConfig::new(8).init(device),
                deconv3: ConvTranspose2dConfig::new([8, 1], [3, 3])
                    .with_stride([2, 2])
                    .with_padding([1, 1])
                    .with_padding_out([1, 1])
                    .init(device),
            },
            width: self.width,
            height: self.height,
        }
    }
}

impl<B: Backend> Model<B> {
    pub fn forward(&self, x: Tensor<B, 4>) -> Tensor<B, 4> {
        let latent = self.encoder.forward(x);
        self.decoder.forward(latent, self.width, self.height)
    }

    pub fn encode(&self, x: Tensor<B, 4>) -> Tensor<B, 2> {
        self.encoder.forward(x)
    }
}

impl<B: Backend> Encoder<B> {
    pub fn forward(&self, x: Tensor<B, 4>) -> Tensor<B, 2> {
        let x = relu(self.bn1.forward(self.conv1.forward(x)));
        let x = relu(self.bn2.forward(self.conv2.forward(x)));
        let x = relu(self.bn3.forward(self.conv3.forward(x)));
        let x = x.flatten(1, 3);
        self.fc.forward(x)
    }
}

impl<B: Backend> Decoder<B> {
    pub fn forward(&self, x: Tensor<B, 2>, width: usize, height: usize) -> Tensor<B, 4> {
        let batch_size = x.dims()[0];
        let x = relu(self.fc.forward(x));
        let x = x.reshape([batch_size, 32, height / 8, width / 8]); 
        let x = relu(self.bn1.forward(self.deconv1.forward(x)));
        let x = relu(self.bn2.forward(self.deconv2.forward(x)));
        sigmoid(self.deconv3.forward(x))
    }
}
