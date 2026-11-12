# Tagih

**Get paid without the awkward follow-ups.**

Tagih is an AI collections agent for freelancers and small businesses that invoice through PayPal. Every PayPal invoice that passes its due date becomes a case. An AI agent investigates why the client is late, proposes how to collect, and your policy decides what may happen without you. The action is executed through the PayPal Invoicing API, and the case only closes when PayPal reports the invoice as paid.

## The problem

Sending an invoice takes a minute. Getting paid can take weeks. Freelancers and small businesses have to remember who has not paid, guess why, pick a tone that does not damage the relationship, and keep checking whether the money arrived. Automatic reminders send the same text to everyone and never learn what works.

## Features

- **Invoice from a chat.** Paste the conversation where you agreed on the work. AI drafts the invoice (client, email, amount, due date) and leaves blank what the chat does not say. You check it, then it is created and sent through PayPal.
- **Collection cases.** An overdue PayPal invoice opens a case automatically. One case per invoice.
- **A real agent, shown live.** The agent decides which tools to call: it reads the invoice from PayPal, the client's payment history, earlier attempts and the measured outcomes of each strategy. Every tool call carries the agent's reason, and the whole run is shown live with a progress view and a step-by-step trace.
- **Checked plans.** Code validates the agent's plan before anyone sees it: every fact must cite a tool call, success rates must match the data, and actions must come from a fixed library. Rejected plans go back to the agent to fix.
- **Policy and autonomy you control.** Rules decide whether a plan can run on its own, needs your approval, or is blocked (amount threshold, discounts and installments, low confidence, reminder cooldown, invoice already paid, suspicious client text). Autonomy is off by default and can be switched on.
- **Approve, edit or choose another option.** Pick any of the 2 to 3 options, edit the message the client will read, then approve.
- **Executed in PayPal.** Reminders, early-payment discounts (cancel and reissue) and installment plans (cancel and split into several invoices) are real PayPal Invoicing API calls.
- **Closed only when PayPal says PAID.** The verifier reads the invoice status from PayPal. If the payment window runs out, the case reopens and the agent plans again knowing what failed. Three failures escalate to you.
- **Playbook that learns.** Each verified outcome updates the success rate of that strategy for that kind of client, which the agent reads next time.
- **Model picker.** Run the agent on GPT-5 mini, GPT-5.4 mini, GPT-5.5 or GPT-4.1.
- **Demo control.** A guided script, a demo clock to move time forward (collections take days), policy limits and reset.

## How PayPal and AI are used

| Tool | How Tagih uses it |
|---|---|
| **PayPal Invoicing API v2** (sandbox) | Create and send invoices, send reminders, cancel and reissue with a discount, split into installment invoices, read live invoice status to open cases and to verify payment |
| **PayPal sandbox accounts** | The client pays the invoice as a sandbox buyer; the case closes when PayPal reports PAID |
| **OpenAI API** (GPT-5 mini by default, selectable) | Tool-calling collections agent (investigation and planning), structured extraction of invoices from chats, self-correction when the validator rejects a plan |
| **Next.js, TypeScript** | Web app and API |
| **Render** | Hosting |

The agent only has read tools. It cannot send, cancel or change anything in PayPal by itself: it submits a plan, code validates it, the policy decides, and only then does code call PayPal.

## Setup

Requirements: Node.js 20 or later.

```bash
git clone https://github.com/Inforable/paypal-hackathon.git
cd paypal-hackathon
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com, API keys |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | developer.paypal.com, Apps & Credentials, Sandbox, Create App |
| `PAYPAL_DEMO_RECIPIENT` | developer.paypal.com, Testing Tools, Sandbox Accounts: the email of the Personal (buyer) account |

Every key is optional. Without PayPal credentials the app uses a PayPal simulator, and without an OpenAI key a rule engine plans instead. Both are labelled in the app.

## Run

```bash
npm run dev
```

Open http://localhost:3000.

Production build:

```bash
npm run build
npm start
```

End-to-end check of the full case lifecycle (uses the simulator, no keys needed):

```bash
npm run e2e
```

## Try it

1. Open **Demo control** and press **Send 4 invoices**. Four clients with different payment habits receive invoices through PayPal.
2. Press **+7 days**. The invoices become overdue and four cases open.
3. Open a case and press **Run agent**. Watch the agent work in the live view.
4. On the **Decision** tab, choose an option, edit the message and approve. The action goes out through PayPal.
5. Pay the invoice: in sandbox mode press **Pay in PayPal sandbox** and log in as the sandbox buyer, then **Check PayPal for payment**. The case closes as PAID.
6. Press **+5 days** on an unpaid case to see it reopen and the agent escalate.
7. Switch on **Agent autonomy** on Receivables and run a new case: a small reminder goes out without you.

## Deploy on Render

The repository includes `render.yaml`. Create a new Blueprint on Render from this repository and set the environment variables above. Demo data is stored in a JSON file inside the service and resets when the service restarts.

## License

MIT, see [LICENSE](LICENSE).
