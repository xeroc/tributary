name: Integration Request
description: Propose a new integration or use case for Tributary
title: "[Integration]: "
labels: ["integration"]
assignees: ["xeroc"]
body:

- type: markdown
  attributes:
  value: |
  Thanks for proposing a new integration! This helps us understand how Tributary can be used in real-world applications.
- type: input
  id: contact
  attributes:
  label: Contact Details
  description: How can we get in touch with you if we need more info?
  placeholder: ex. <email@example.com> or @username on Discord/Twitter
  validations:
  required: false
- type: input
  id: tokens
  attributes:
  label: Tokens/Coins
  description: List tokens and coins on Solana that you would want to use
  placeholder: i.e. USDC, SOL, BONK,
  validations:
  required: false
- type: textarea
  id: description
  attributes:
  label: Description
  description: Describe your proposed integration or use case. What project or service would you like to integrate Tributary with? Provide as much detail as possible.
  placeholder: e.g., SaaS subscription for a productivity app
  validations:
  required: true
- type: textarea
  id: benefits
  attributes:
  label: Expected Benefits
  description: How would this integration benefit your project, users, or the Solana ecosystem? What problems does it solve?
  placeholder: e.g., Enables automated monthly payments for users
  validations:
  required: true
- type: textarea
  id: additional-context
  attributes:
  label: Additional Context
  description: Add any other context, links, or code snippets that might help us understand your request.
  placeholder: Links to your project, relevant code, etc.
  validations:
  required: false
