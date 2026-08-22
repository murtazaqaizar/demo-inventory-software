# Shabbir Tools — What's New

Ten additions to the system. **Everything in the main [USER-GUIDE.md](USER-GUIDE.md) still works
exactly the same** — this covers only what changed. Making bills, taking payments and printing are
unchanged. This update adds protections against mistakes, makes daily work faster, and gives you
better information about your money.

## Three new pages in the menu

| Page | What it's for | Who sees it |
|---|---|---|
| **Returns** | Record goods coming back properly | Owner & Staff |
| **Who owes me** | See debts by how old they are | Owner only |
| **Activity log** | See who did what | Owner only |

---

## 1. The system now stops you overselling

When you make a bill for more pieces than you actually have, a red warning appears telling you
exactly what's short.

- **Before:** stock silently went negative, and your profit figures quietly became wrong.
- **Now:** *"Cutting Disc: asking for 100 pcs, only 10 in stock."* You fix it, or tap
  **Sell anyway** if it's a genuine backorder.

> **Why this matters most:** this was the biggest hole in the old system. Wrong stock counts feed
> straight into wrong profit — this stops it at the source.

## 2. You can now cancel a wrong bill  *(Owner only)*

On the **Billing** list, each bill has a red **Void** link. Type a reason and confirm.

The system automatically:
- puts the goods back into stock,
- reverses any money that was received,
- removes the amount from the customer's udhaar,
- keeps the bill number and marks it **VOIDED** with your reason.

> The original guide told you to "record a return and make a fresh bill" for mistakes. You no
> longer need that workaround — just void it.

## 3. Returns now handle the money too

Go to **Returns → + New return**. Pick the customer, add the items coming back with the rate they
were sold at, and choose how to settle it:

| Option | What happens |
|---|---|
| **Credit to their account** | Reduces what the customer owes you |
| **Cash refund** | Money is paid back out of the cash drawer |

- **Before:** "Return in" only added stock back. The customer's balance stayed wrong until someone
  fixed it by hand.
- **Now:** stock *and* money are both settled in one step, and the return shows on their statement.

The quick **Return in** control on the Products page still exists for small stock corrections that
don't involve money.

## 4. Finding a product is much faster

The product box on a bill is now a **search box**. Start typing any part of the name, code, size or
brand — for example `4 inch` or `cut` — and matching products appear instantly, with how many
pieces are in stock beside each one.

Pick with the mouse, or use the arrow keys and **Enter** without touching the mouse. This is the
single biggest time-saver for daily billing, especially on a phone.

## 5. Search and page through your records

Billing, Products, Customers and the Activity log all have a **search bar** at the top and page
buttons at the bottom.

- **Billing** — search by customer name or bill number, and filter by date range
- **Products** — search by name, code, size or brand
- **Customers** — search by name or phone

> **Important fix:** previously only the most recent records were shown and older ones became
> unreachable. Now every record stays findable, however many years you use the system.

## 6. Part cash, part udhaar on one bill

The payment section of a bill now records **what the customer actually pays now**. Tap
**+ Split payment** to add more than one method.

**Example:** a Rs 10,000 bill where the customer hands over Rs 6,000 cash — enter Rs 6,000 as cash,
and the system shows **"Goes on udhaar: Rs 4,000"** and adds exactly that to their account.

Leave the payment blank and the whole bill goes on udhaar, exactly as before. The invoice now
prints the amount paid and the remaining balance.

## 7. "Who owes me" — debts by age  *(Owner only)*

The most useful new page for getting paid. Every customer's outstanding udhaar is split by how long
it has been owed:

| Bucket | Meaning |
|---|---|
| **0–30 days** | Normal |
| **31–60 days** | Worth a call |
| **61–90 days** | Chase it |
| **90+ days** | Serious |

Customers are sorted by who owes the most, with the age of their oldest unpaid bill. Work
right-to-left: the 90+ column is your real problem money.

### Credit limits
Set a limit per customer (when adding them, or leave `0` for no limit). If a new udhaar bill would
push them over it, a warning appears before saving — you can still tap **Approve anyway**.
Customers over their limit are flagged in red on both the Customers and Who owes me pages.

## 8. The Dashboard now tells you the whole story

Instead of just counts, the first screen now shows:

- **Sales today** and **sales this month**, with an up/down comparison against last month
- **Total owed to you**, and how much is over 30 days old *(Owner)*
- **Cash + Bank** position *(Owner)*
- **Low-stock alerts** (as before)
- **Top debtors** — the five biggest, tap to open their statement *(Owner)*
- **Cheques due this week** — so nothing is forgotten *(Owner)*

Ten seconds on this page each morning tells you where the business stands.

## 9. Download reports for Excel  *(Owner only)*

On the **Reports** page there's a new download row. Each button saves a file you can open in Excel
or hand to your accountant:

- Income statement (for the month or year you're viewing)
- **Stock valuation** — every product, pieces held, cost, and total inventory value
- Who owes me (aging)
- Customer balances
- All bills
- Expenses

The **stock value** total also appears on the Reports page itself — useful for insurance and for
knowing how much money is sitting on your shelves.

## 10. More logins, and a record of who did what  *(Owner only)*

### Add staff logins
On the **Users** page you can now **add a login** for each person — full name, username, password
and role (Staff or Owner). You're no longer limited to two.

You can also **Deactivate** a login when someone leaves. They can no longer sign in, but their past
activity stays on record.

### Activity log
The new **Activity log** page shows every important action with the person's name and the time:
bills created, bills voided, returns, stock adjustments, and login changes. Searchable and
filterable by date.

> **Why this matters:** give every worker their own login. Sharing one account means you can never
> tell who adjusted stock or gave a below-cost price — with separate logins, the activity log
> answers that question.

---

## What to do now

1. **Give each worker their own login** — Users → Add a login. Then the activity log becomes meaningful.
2. **Set credit limits** for customers you want to cap, so you get warned before they go too deep.
3. **Open "Who owes me"** and start with the 90+ column — that's the money most at risk.
4. **Use Returns** instead of the old workaround whenever goods come back with money involved.
5. **Download the stock valuation** once so you know what your inventory is worth today.

> **Still true:** the boundaries in the original guide have not changed — no tax/FBR invoicing, no
> barcode scanning, one storage location, English and A4 only, and WhatsApp still needs you to tap send.
