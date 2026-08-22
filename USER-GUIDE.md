# Shabbir Tools — Inventory, Billing & Accounts
## Complete User Guide

This guide explains everything the system does and exactly how to use it, step by step.
No technical knowledge needed. Keep it handy for the first few weeks.

---

## Table of contents

1. [What this system does](#1-what-this-system-does)
2. [Logging in](#2-logging-in)
3. [The two logins: Owner and Staff](#3-the-two-logins-owner-and-staff)
4. [Using it on a phone](#4-using-it-on-a-phone)
5. [FIRST-TIME SETUP (do this once, in order)](#5-first-time-setup-do-this-once-in-order)
6. [The Dashboard](#6-the-dashboard)
7. [Products & Stock](#7-products--stock)
8. [Making a bill (the daily job)](#8-making-a-bill-the-daily-job)
9. [Printing invoices, challans & WhatsApp](#9-printing-invoices-challans--whatsapp)
10. [Customers & Udhaar](#10-customers--udhaar)
11. [Buying stock (Purchases)](#11-buying-stock-purchases)
12. [Suppliers you owe (Payables)](#12-suppliers-you-owe-payables)
13. [Cheques](#13-cheques)
14. [Cash & Bank](#14-cash--bank)
15. [Expenses](#15-expenses)
16. [Reports & Profit](#16-reports--profit)
17. [Changing passwords](#17-changing-passwords)
18. [Daily / weekly / monthly routine](#18-daily--weekly--monthly-routine)
19. [What the system does NOT do](#19-what-the-system-does-not-do)
20. [Common questions & problems](#20-common-questions--problems)

---

## 1. What this system does

It replaces your notebooks and Excel files with one system that keeps track of:

- **Stock** — what you have, what's running low
- **Bills** — professional A4 invoices with your negotiated rates
- **Udhaar** — exactly how much every customer owes you
- **Payables** — how much you owe your suppliers
- **Money** — cash in hand vs bank, and every cheque
- **Profit** — real monthly and yearly profit, and which products actually make money

It works on the office computer **and** on your phone, and your data is stored safely online.

---

## 2. Logging in

1. Open the website address in any browser (Chrome recommended).
2. Type your **Username** and **Password**.
3. Tap **Sign in**.

> **Tip:** If you're unsure what you typed, tap **Show** next to the password box to reveal it.

**Your login details are provided separately by your developer.** The very first thing you
should do is change both passwords — see [section 17](#17-changing-passwords).

To log out, tap **Sign out** at the bottom of the menu.

---

## 3. The two logins: Owner and Staff

There are two accounts, and they see **different things**:

| | Owner | Staff |
|---|---|---|
| Make bills | ✅ | ✅ |
| Manage products & stock | ✅ | ✅ |
| Customers & udhaar, take payments | ✅ | ✅ |
| **Purchase prices & product cost** | ✅ | ❌ hidden |
| **Profit & income statement** | ✅ | ❌ hidden |
| Suppliers, cheques, cash & bank, expenses | ✅ | ❌ hidden |
| Change passwords | ✅ | ❌ |

This means your staff can run the counter all day without ever seeing what you paid for
goods or how much profit you make. The menu simply shows fewer items when staff log in.

---

## 4. Using it on a phone

The system fits phone screens automatically.

- Tap **Menu** at the top to open the navigation, tap a page to go there.
- Lists (products, customers, bills) appear as **cards**, one per row, with labels — no
  need to scroll sideways.
- Everything you can do on the computer, you can do on the phone.

---

## 5. FIRST-TIME SETUP (do this once, in order)

Do these steps **in this order** — later steps depend on earlier ones.

### Step 1 — Change both passwords
Go to **Users** → set a new password for Owner and for Staff. (See [section 17](#17-changing-passwords).)

### Step 2 — Enter your products
Go to **Products / Stock** → **+ New product**. For each product fill in:

- **Product name** — e.g. `Cutting Disc`
- **Size** — e.g. `4 inch`
- **Variant / brand** — e.g. `1.0mm - Brand A`
  *(Size and variant matter: a 4-inch 1.0mm disc and a 4-inch 1.5mm disc are two separate products.)*
- **Pieces per box** — how many pieces are in one box (e.g. `25`)
- **Pieces per carton** — how many pieces in a carton (put `0` if you don't sell cartons)
- **Low-stock alert level** — when stock falls to this number, the system warns you (e.g. `50`)
- **Opening stock count (pieces)** — how many pieces you have **right now** on the shelf
- **Initial cost / piece (Rs)** — what one piece costs you *(Owner only; you can leave it 0
  and it will be set automatically the first time you record a purchase)*

Tap **Save product**. A unique code (ABR-0001, ABR-0002…) is created automatically — you
don't need barcodes.

> Repeat for all ~50 products. This is the longest part of setup — do it once, carefully.

### Step 3 — Enter your customers and what they already owe
Go to **Customers (Udhaar)** → fill the **Add customer** form:

- **Name**, **Phone**
- **Opening udhaar (Rs)** — how much this customer owes you **today**

Tap **Add customer**. This makes the system match reality from day one.

### Step 4 — Enter your suppliers
Go to **Suppliers (Payables)** → add each local supplier you buy from on credit.

### Step 5 — Enter your opening cash and bank balance
Go to **Cash & Bank** → use the **Opening / adjust** box:
- Choose **Cash in Hand**, enter the cash amount you have, note "Opening cash", tap **Apply**.
- Choose **Bank**, enter your bank balance, tap **Apply**.

**Setup is now complete.** You can start billing.

---

## 6. The Dashboard

The first screen after login shows:

- **Active products** — how many products you have
- **Customers** — how many customers
- **Low-stock items** — how many products need reordering
- **Low-stock alerts** — the actual list of products running low, with how many pieces are left

Check this every morning.

---

## 7. Products & Stock

Go to **Products / Stock**. You'll see every product with its code, size/variant, unit
conversions, current stock in pieces, and (Owner only) its latest cost.

A red **Low** tag appears when stock has fallen to or below the alert level you set.

### Adding a product
Tap **+ New product** — see [Step 2 above](#step-2--enter-your-products).

### Changing stock by hand
Each product row has a small control with a dropdown and a quantity box:

| Choose | Use it when | Effect on stock |
|---|---|---|
| **Return in** | A customer brings goods back | Adds pieces back |
| **Sample out** | You give a free sample/bonus outside a bill | Removes pieces (cost still recorded) |
| **Adjust ±** | Correcting a counting mistake | Adds or removes (type `-5` to remove 5) |

Type the number of **pieces**, then tap **Apply**.

> **Important:** stock is always counted in **pieces** inside the system. If you sell 2 boxes
> of a 12-piece product, stock drops by 24 automatically.

---

## 8. Making a bill (the daily job)

Go to **Billing** → **+ New bill**.

### a) Choose the customer
- Pick the customer's name from the dropdown, **or**
- Leave it as **Cash Sale (walk-in)** for a customer you don't track.

### b) Choose how it's being paid
| Method | Meaning |
|---|---|
| **Cash** | Money received now → goes into Cash in Hand |
| **Online transfer** | Money received now → goes into Bank |
| **Cheque** | You'll be asked for cheque number, bank and date; it goes to the cheque register as *pending* |
| **Udhaar (pay later)** | Nothing received now → added to the customer's balance |

### c) Add the items
For each line:
1. **Select product** from the dropdown.
2. **Unit** — Piece, Box or Carton.
3. **Qty** — how many of that unit (e.g. `2` boxes).
4. **Rate Rs** — the price you agreed, **per unit chosen**. You can type any rate — prices
   are negotiable.

Tap **+ Add line** for more products. Tap **✕** to remove a line.

**Helpful things the system does automatically:**

- **Last price reminder** — if you've sold this product to this customer before, it shows
  *"Last: Rs 130.00 / box"* under the line and fills that rate in. This stops you
  accidentally undercharging a repeat customer.
- **Below-cost warning** — if a rate is below what the goods cost you, a yellow warning
  appears listing the products before saving. You can tap **Save anyway** if the deal is
  intentional, or **Go back** to fix the price.
  *(Staff see the warning but never see the actual cost figure.)*

### d) Free samples / bonus items
Tick **Free sample / bonus** on a line (e.g. "buy 10 get 1 free"). The rate becomes blank,
the customer is charged nothing, stock still reduces, and the cost is still recorded so your
profit stays honest.

### e) Save
Check the **Bill total** at the bottom, then tap **Save & print**. The invoice opens ready
to print.

---

## 9. Printing invoices, challans & WhatsApp

After saving (or from **Billing** → the list of bills):

### Print the invoice
On the invoice screen tap **Print / Save as PDF**. It's formatted for a normal **A4** printer.
In the print window you can also choose "Save as PDF" to make a PDF file.

### Print a delivery challan (gate pass)
From the **Billing** list, tap **Challan** on that bill. This is a separate document for goods
leaving your premises — it lists quantities and pieces but **no prices**, with signature lines.

### Send on WhatsApp
Tap the green **Share on WhatsApp** button. WhatsApp opens with a message to that customer
already written (invoice number and total). If you want to send the PDF itself, first use
**Print → Save as PDF**, then attach that file in the chat. You tap send — nothing is ever
sent automatically.

---

## 10. Customers & Udhaar

Go to **Customers (Udhaar)**. Every customer shows one running balance — exactly what they
owe you right now.

- **Amber amount** = they owe you that much
- **Settled** = nothing owing
- **Credit** = you owe them (they've overpaid)

### Recording a payment
When a customer pays, find their row, type the **amount** in the small box, choose
**Cash / Online / Cheque**, and tap **Pay**. Their balance drops immediately, and cash or
bank goes up.

> Payments are recorded as a **lump sum against the balance** — you don't have to match the
> money to particular bills. This is how you asked for it to work.

### Customer statement
Tap **View** on a customer to open their statement. It shows the opening balance, every
udhaar bill and every payment in order, and the closing balance.

- Use **From** / **To** dates and tap **Filter** to show a specific period (e.g. last month).
- Tap **Print / PDF** to print or save it.
- Tap **Share on WhatsApp** to send them the summary.

---

## 11. Buying stock (Purchases)

*Owner only.* Go to **Purchases** → **+ New purchase**.

1. **Supplier** — pick the supplier, or leave as "none / cash purchase".
2. Tick **On credit (payable)** if you haven't paid yet — this adds it to what you owe them.
3. Tick **Import (landed cost)** if the goods came from abroad. Extra boxes appear:
   - **Freight**, **Customs duty**, **Clearing**, **Local transport**
4. Add a line per product: **product**, **pieces received**, **cost per piece (Rs)**.
5. Tap **Save purchase**.

**What happens automatically:**
- Stock goes **up** by the pieces received.
- For imports, the extra costs are **spread fairly across the items by value**, giving each
  product its true **landed cost** per piece — not just the supplier's price.
- Each product's **latest cost** updates, which is what profit is calculated from.
- If it was on credit, the supplier's payable goes up.

> **Example:** you import 10 pcs at Rs 100 and 10 pcs at Rs 50, with Rs 150 total extras.
> The system charges Rs 100 of the extras to the first product (Rs 110/pc landed) and
> Rs 50 to the second (Rs 55/pc landed) — in proportion to their value.

---

## 12. Suppliers you owe (Payables)

*Owner only.* Go to **Suppliers (Payables)**.

- Add a supplier with the **Add supplier** form.
- Each supplier shows the **payable** — what you currently owe them.
- To record a payment, type the amount in their row and tap **Pay**. The payable drops and
  your cash reduces.
- The bottom row shows your **total payable** across all suppliers.

---

## 13. Cheques

*Owner only.* Go to **Cheques**. This tracks every cheque until it actually clears.

### Recording a cheque
Fill the **Record cheque** form:
- **Type** — *Received* (from a customer) or *Issued* (you wrote it)
- **Cheque #**, **Bank**, **Amount (Rs)**, **Date**, and optionally the party name

Cheques you take on a bill (payment method = Cheque) are added here automatically.

### Following it up
Every cheque starts as **PENDING**. When you hear from the bank, tap:
- **Cleared** — the money moves in or out of your **Bank** balance
- **Bounced** — no money moves; the cheque is marked bounced

This is how you always know which cheques are still outstanding.

---

## 14. Cash & Bank

*Owner only.* Go to **Cash & Bank**. Two cards at the top show your **Cash in Hand** and
**Bank** balances separately.

Three boxes below:

| Box | Use |
|---|---|
| **Owner withdrawal (drawing)** | Money you take out for personal use. Choose account, amount, tap **Record drawing**. |
| **Transfer** | Moving money between cash and bank. |
| **Opening / adjust** | Setting your starting balance, or correcting a mistake. Use a minus sign to reduce. |

> **Important:** owner withdrawals are **not** business expenses. They reduce your cash but
> do **not** reduce your profit — this keeps the profit figure honest.

Below, **Recent money movements** lists the last 25 movements — sales received, customer
payments, supplier payments, expenses, drawings, cheques cleared and transfers.

---

## 15. Expenses

*Owner only.* Go to **Expenses** to record what it costs to run the business.

Fill in **Category** (Electricity, Water, Storage/Rent, Labour, Transport, Salaries, Other),
**Amount**, **Date**, and an optional note, then tap **Add expense**.

Each expense reduces your cash and is subtracted in the income statement.

---

## 16. Reports & Profit

*Owner only.* Go to **Reports**.

### Choosing the period
- Pick a **Month** and tap **View month**, or
- Type a **Year** and tap **View year**.

### Income statement
```
Sales                        (everything you billed)
 − Cost of goods sold        (what those goods cost you)
= Gross profit
 − Operating expenses        (electricity, salaries, transport …)
 − Free samples (marketing)  (cost of giveaways)
= Net profit                 ← the real number
```
Owner drawings are **excluded** — taking money out is not a business loss.

### Profit per product
A table showing, for every product sold in that period: pieces sold, revenue, cost, and
**profit** (green = making money, red = losing money). Sorted best-first, so you can see at a
glance which products to push and which to rethink.

### Stock summary
How many active products you have, how many are low, and the list of low-stock items.

> **One thing to know about profit:** the system values sales at the **most recent cost** you
> paid. While you still have older, cheaper stock on the shelf, profit may read slightly high
> for a short period. This is normal and fine for internal tracking.

---

## 17. Changing passwords

*Owner only.* Go to **Users**. You'll see both accounts (Owner and Staff).

For the account you want to change:
1. Type the **New password** (at least 6 characters).
2. Type it again in **Confirm**.
3. Tap **Update owner** / **Update staff**.

A green confirmation appears. Tap **Show** if you want to check what you typed.

Passwords are stored scrambled (hashed) — nobody, including your developer, can read them.
If a password is forgotten, the Owner can simply set a new one here.

---

## 18. Daily / weekly / monthly routine

**Every day**
- Check the **Dashboard** for low-stock alerts.
- Make bills as sales happen (**Billing → + New bill**).
- Record customer payments as money comes in (**Customers**).
- Record expenses as they're paid (**Expenses**).

**Every week**
- Check **Cheques** for anything still pending.
- Check **Suppliers** for what you owe.
- Reorder anything on the low-stock list.

**Every month**
- Record any remaining expenses for the month.
- Open **Reports**, pick the month, and read the **income statement**.
- Look at **profit per product** — push the winners.
- Send statements to customers with large balances (**Customers → View → Share on WhatsApp**).

---

## 19. What the system does NOT do

These were agreed as out of scope, so there are no surprises:

- **No tax / FBR / NTN invoicing** — this is for your own internal tracking.
- **No bill-by-bill udhaar matching** — payments are lump sums against the balance.
- **No aging reports or credit limits** — no "how old is this debt" breakdown, no automatic blocking.
- **No barcode scanning** — product codes are generated and picked on screen.
- **One storage location only.**
- **No advance orders or quotations** — billing and delivery happen together.
- **English interface and A4 printing only** — no Urdu interface, no thermal receipts.
- **WhatsApp sending is not automatic** — the chat opens ready, you tap send.

Any of these can be added later as a separate piece of work.

---

## 20. Common questions & problems

**I typed the password but it says incorrect.**
Check for capital letters and extra spaces, and tap **Show** to see what you typed. If still
stuck, the Owner can reset it in **Users**. If the Owner password is lost, contact your developer.

**I can't see Purchases / Reports / Cash & Bank in the menu.**
You're logged in as **Staff**. Those are Owner-only. Sign out and sign in as Owner.

**I billed the wrong quantity / wrong customer.**
Bills can't be edited once saved (this keeps the records honest). Record a **Return in** on
the product to put the stock back, and make a fresh correct bill. For an udhaar bill, record
a payment or adjustment against the customer to correct the balance.

**Stock number looks wrong.**
Use **Adjust ±** on the product to correct it — enter the difference (e.g. `-3`), and it's
recorded as an adjustment so the history stays traceable.

**A customer returned goods.**
Use **Return in** on that product for the number of pieces. If they should also get money or
credit back, record it on their account.

**The profit looks too high.**
See the note in [section 16](#16-reports--profit) — the latest-cost method can read slightly
high while cheaper old stock remains. It evens out.

**Do I need to save or back up?**
No. Everything saves the moment you tap the button, and the data lives online with automatic
backups. If your phone or computer breaks, your records are safe — just log in from another device.

**Can two people use it at once?**
Yes. The Owner and Staff can both be logged in on different devices at the same time.

---

*Shabbir Tools — Inventory, Billing & Accounts. For support, contact your developer.*
