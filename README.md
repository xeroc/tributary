# Tributary

Quick start guide for running the Tributary application.
Tributary - a river or stream that flows into a larget river or a lake

## Prerequisites

- Node.js 20.19+ or 22.12+
- pnpm 9.6.0+

## Setup & Run

```bash
git clone https://github.com/tributary-so/tributary

# Contract
anchor build
anchor test

cd tributary
pnpm install

cd sdk
pnpm build

cd ../sdk-react
pnpm build

cd ../app
pnpm run dev
```

## x402

We provide a demo implementation for x402 to use Tributary subscriptions within
the x402 payment required ecosystem. [Go check it out](./x402/)
