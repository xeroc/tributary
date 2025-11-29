# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Security Best Practices

When using Tributary:

- Always verify smart contract addresses before interacting
- Use hardware wallets for significant amounts
- Keep your private keys secure
- Review transaction details carefully

For more information on Tributary's security model, see our [documentation](https://docs.tributary.so).

## Reporting a Vulnerability

If you discover a security vulnerability in Tributary, please report it to us as follows:

1. **Do not** create a public GitHub issue for the vulnerability.
2. Email your report to <security@tributary.so> using subject line: `[SECURITY] Brief description`
3. Include detailed information about the vulnerability, including:
   - Description of the issue
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

We will acknowledge your report within 48 hours and provide a more detailed response within 7 days indicating our next steps.

We kindly ask that you give us reasonable time to fix the issue before disclosing it publicly. We will credit you in our security advisory once the issue is resolved.

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

## Scope

### In Scope

- Tributary on-chain program (`TRibg8W8zmPHQqWtyAD1rEBRXEdyU13Mu6qX1Sg42tJ`)
- SDK package (`@tributary-so/sdk`)
- Smart contract logic vulnerabilities
- Token handling and distribution bugs
- Access control issues
- Arithmetic errors

### Out of Scope

- Frontend/UI issues (unless they lead to contract exploitation)
- Social engineering attacks
- Denial of service attacks
- Issues in third-party dependencies (report to respective maintainers)
- Already known issues

## Safe Harbor

We will not pursue legal action against security researchers who:

- Make a good faith effort to avoid privacy violations, data destruction, or service interruption
- Only interact with accounts they own or have explicit permission to test
- Do not exploit vulnerabilities beyond what is necessary to demonstrate them
- Report findings promptly and allow reasonable time for remediation before disclosure

## Bug Bounty

We currently do not have a formal bug bounty program. However, we recognize and appreciate security researchers who help improve our protocol. Significant findings may be rewarded at our discretion.

## Disclosure Policy

- We request 90 days to address reported vulnerabilities before public disclosure
- We will coordinate with reporters on disclosure timing
- We will credit reporters (unless they prefer anonymity) in any public disclosure

## Contact

- **Security issues**: <security@tribuatary.so>
- **General inquiries**: <https://github.com/tributary-so/tributary/issues>
