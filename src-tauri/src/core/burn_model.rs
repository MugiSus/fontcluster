use burn::{
    config::Config,
    module::Module,
    nn::{
        conv::{Conv2d, Conv2dConfig, ConvTranspose2d, ConvTranspose2dConfig},
        Linear, LinearConfig, PaddingConfig2d,
    },
    tensor::{activation::{relu, sigmoid}, backend::Backend, Tensor},
};

#[derive(Module, Debug)]
pub struct Model<B: Backend> {
    encoder: Encoder<B>,
    decoder: Decoder<B>,
}

#[derive(Module, Debug)]
pub struct Encoder<B: Backend> {
    conv1: Conv2d<B>,
    conv2: Conv2d<B>,
    conv3: Conv2d<B>,
    fc: Linear<B>,
}

#[derive(Module, Debug)]
pub struct Decoder<B: Backend> {
    fc: Linear<B>,
    deconv1: ConvTranspose2d<B>,
    deconv2: ConvTranspose2d<B>,
    deconv3: ConvTranspose2d<B>,
}

#[derive(Config, Debug)]
pub struct ModelConfig {
    pub latent_dim: usize,
    #[config(default = 128)]
    pub image_size: usize,
}

impl ModelConfig {
    pub fn init<B: Backend>(&self, device: &B::Device) -> Model<B> {
        Model {
            encoder: Encoder {
                // 128 -> 64
                conv1: Conv2dConfig::new([1, 8], [3, 3]).with_stride([2, 2]).with_padding(PaddingConfig2d::Explicit(1, 1)).init(device),
                // 64 -> 32
                conv2: Conv2dConfig::new([8, 16], [3, 3]).with_stride([2, 2]).with_padding(PaddingConfig2d::Explicit(1, 1)).init(device),
                // 32 -> 16
                conv3: Conv2dConfig::new([16, 32], [3, 3]).with_stride([2, 2]).with_padding(PaddingConfig2d::Explicit(1, 1)).init(device),
                // 16*16*32 = 8192
                fc: LinearConfig::new(8192, self.latent_dim).init(device),
            },
            decoder: Decoder {
                fc: LinearConfig::new(self.latent_dim, 8192).init(device),
                // 16 -> 32
                deconv1: ConvTranspose2dConfig::new([32, 16], [3, 3])
                    .with_stride([2, 2])
                    .with_padding([1, 1])
                    .with_padding_out([1, 1])
                    .init(device),
                // 32 -> 64
                deconv2: ConvTranspose2dConfig::new([16, 8], [3, 3])
                    .with_stride([2, 2])
                    .with_padding([1, 1])
                    .with_padding_out([1, 1])
                    .init(device),
                // 64 -> 128
                deconv3: ConvTranspose2dConfig::new([8, 1], [3, 3])
                    .with_stride([2, 2])
                    .with_padding([1, 1])
                    .with_padding_out([1, 1])
                    .init(device),
            },
        }
    }
}

impl<B: Backend> Model<B> {
    pub fn forward(&self, x: Tensor<B, 4>) -> Tensor<B, 4> {
        let latent = self.encoder.forward(x);
        self.decoder.forward(latent)
    }

    pub fn encode(&self, x: Tensor<B, 4>) -> Tensor<B, 2> {
        self.encoder.forward(x)
    }
}

impl<B: Backend> Encoder<B> {
    pub fn forward(&self, x: Tensor<B, 4>) -> Tensor<B, 2> {
        let x = relu(self.conv1.forward(x));
        let x = relu(self.conv2.forward(x));
        let x = relu(self.conv3.forward(x));
        let x = x.flatten(1, 3);
        self.fc.forward(x)
    }
}

impl<B: Backend> Decoder<B> {
    pub fn forward(&self, x: Tensor<B, 2>) -> Tensor<B, 4> {
        let batch_size = x.dims()[0];
        let x = relu(self.fc.forward(x));
        let x = x.reshape([batch_size, 32, 16, 16]); 
        // Note: Real upsampling would involve TransposedConv2d or Upsample
        // For compression only, the decoder architecture is less critical than the encoder
        let x = relu(self.deconv1.forward(x));
        let x = relu(self.deconv2.forward(x));
        sigmoid(self.deconv3.forward(x))
    }
}
