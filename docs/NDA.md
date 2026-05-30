# Mutual Non-Disclosure Agreement

This Mutual Non-Disclosure Agreement ("Agreement") is entered into on **__________ , 20___** ("Effective Date") by and between:

**PARTY A — THE DEVELOPER**
- **Name:** Gerald Durano
- **Address:** _________________________________________
- **Contact:** geralddurano101@gmail.com
- Acting as an independent software developer ("Developer").

**PARTY B — THE COOPERATIVE**
- **Name:** POWASSCO Multipurpose Cooperative
- **Registered address:** _________________________________________
- **Authorised representative:** ____________________________________
- **Position:** _________________________________________
- **Contact:** _________________________________________

Each individually a "Party," collectively the "Parties."

---

## 1. Purpose

The Parties intend to discuss, evaluate, and carry out the design, development, deployment, operation, and maintenance of the **POWASSCO Management System** (a custom cooperative management web/mobile platform) and any related professional services (the "Purpose").

In the course of these activities, each Party may disclose to the other certain non-public, confidential, and proprietary information. This Agreement governs the protection and use of that information.

---

## 2. Definition of Confidential Information

"Confidential Information" means any information disclosed by one Party (the "Disclosing Party") to the other (the "Receiving Party") in any form — oral, written, electronic, visual — that is either marked confidential or that a reasonable person would understand to be confidential under the circumstances.

Confidential Information **includes**, without limitation:

a. **Cooperative business data** — member lists, PN numbers, addresses, contact details, meter numbers, bill histories, loan records, payroll, employee personal data, financial reports, board minutes, internal policies, audit logs.

b. **Developer technical material** — source code, software architecture, database schemas, deployment configurations, API keys, security credentials, build artefacts, design documents, planning notes, internal tooling, and any unreleased features.

c. **Commercial information** — pricing, proposals, payment terms, contracts, supplier or vendor agreements, marketing plans.

d. **System credentials** — passwords, JWT secrets, MongoDB connection strings, PayMongo / Xendit API keys, recovery codes, 2FA secrets, webhook secrets, server access details.

e. **Personally Identifiable Information (PII)** of members, employees, and customers — handled in accordance with the Republic Act No. 10173 (Philippine Data Privacy Act of 2012).

f. **Any derivatives** — copies, summaries, excerpts, analyses, or transformations of any of the above.

---

## 3. Exclusions

Confidential Information does **not** include information that:

a. Was lawfully in the Receiving Party's possession before disclosure, without an obligation of confidentiality, and is documented as such; or
b. Is or becomes publicly known through no act or omission of the Receiving Party; or
c. Is lawfully obtained from a third party who has the right to disclose it and is not under a confidentiality obligation; or
d. Is independently developed by the Receiving Party without use of or reference to the Disclosing Party's Confidential Information; or
e. Is required to be disclosed by law, court order, or governmental authority — provided the Receiving Party (where legally permitted) gives the Disclosing Party prompt prior written notice and reasonable opportunity to seek a protective order.

---

## 4. Obligations of the Receiving Party

The Receiving Party shall:

a. **Use** the Confidential Information solely for the Purpose stated in Section 1.

b. **Protect** the Confidential Information using at least the same degree of care it uses for its own confidential information of a similar nature, and in no event less than reasonable care.

c. **Limit access** to the Confidential Information to those of its personnel, contractors, or advisors who have a legitimate need to know for the Purpose, and who are bound by confidentiality obligations no less restrictive than those of this Agreement.

d. **Not** reverse-engineer, decompile, disassemble, or attempt to derive any source code, algorithms, or design from any object code or compiled artefact (except as expressly permitted under Section 9 — Ownership).

e. **Not** disclose, sell, license, publish, or otherwise transfer Confidential Information to any third party without the prior written consent of the Disclosing Party.

f. **Not** use the Confidential Information to compete with the Disclosing Party, solicit its members or employees, or develop a competing system or service.

g. **Notify** the Disclosing Party promptly in writing upon discovery of any actual or suspected unauthorised disclosure, breach, or misuse, and cooperate in remediation.

---

## 5. Data Privacy & Member Data

The Parties acknowledge that the Confidential Information includes PII of cooperative members and employees protected under the **Data Privacy Act of 2012 (RA 10173)** and applicable issuances of the National Privacy Commission.

Accordingly:

a. The Developer acts as a **Personal Information Processor** on behalf of the Cooperative (the **Personal Information Controller**).
b. The Developer shall process member and employee data **only as necessary to perform the Purpose** and **only on the documented instructions of the Cooperative.**
c. The Developer shall implement reasonable and appropriate organisational, physical, and technical security measures (as further described in [SYSTEM-OVERVIEW.md](./SYSTEM-OVERVIEW.md), Section 5).
d. The Developer shall not transfer member data to any third country or external party except to deploy and operate the agreed third-party services (Vercel, Render, MongoDB Atlas, payment service providers) under contracts that uphold equivalent data protection.
e. The Developer shall notify the Cooperative in writing within **forty-eight (48) hours** of becoming aware of any personal data breach.
f. On termination of services, the Developer shall, at the Cooperative's option, return or securely destroy all member and employee data in the Developer's possession, except records the Developer is required by law to retain.

---

## 6. Security of Credentials

Without limiting Section 4:

a. Production credentials (database URI, JWT secret, PSP API keys, webhook secrets) shall be stored in the host environment (Render env vars) and **never** in version-control or in chat/email.
b. The Developer shall not retain copies of production credentials beyond the scope reasonably required to operate the system. On rotation, prior values shall be discarded.
c. Each Party shall use multi-factor authentication on its accounts that have access to the system or its hosting providers.

---

## 7. Term

This Agreement takes effect on the Effective Date and continues for the longer of (a) **two (2) years** from the Effective Date or (b) the duration of any engagement between the Parties plus a tail of one (1) year after termination of that engagement.

For trade secrets and member PII, the confidentiality obligations survive indefinitely or for as long as the law requires.

---

## 8. Return or Destruction of Information

Upon written request by the Disclosing Party, or upon termination of any engagement, the Receiving Party shall within **fifteen (15) business days**:

a. Return all Confidential Information in tangible form; and
b. Securely destroy all copies, electronic files, derivatives, and notes; and
c. Provide a written certification of destruction, signed by an authorised representative.

The Receiving Party may retain (i) one (1) archival copy in legal custody solely for compliance with law or contract; and (ii) automated backups that expire on the provider's normal schedule, which shall remain subject to this Agreement until expiry.

---

## 9. Ownership & Intellectual Property

Nothing in this Agreement transfers ownership of any intellectual property between the Parties.

a. Confidential Information remains the property of the Disclosing Party.

b. Upon **final payment** of the agreed development fee under the Client Proposal, the Cooperative receives a **perpetual, exclusive license** to use, modify, and operate the source code of the POWASSCO Management System for the internal operations of the Cooperative and its successors.

c. The Developer **retains the right to reuse** generic patterns, boilerplate, utility libraries, and architectural know-how acquired during the engagement in other projects, **provided no cooperative-specific data, branding, or unique business logic is reused.**

d. Neither Party acquires any right to the other's trademarks, service marks, or trade names under this Agreement.

---

## 10. No Warranty

All Confidential Information is provided "**as-is**." Neither Party makes any warranty, express or implied, regarding the accuracy, completeness, or fitness for any purpose of the Confidential Information disclosed.

---

## 11. Remedies

The Parties acknowledge that monetary damages may be inadequate for any breach of this Agreement. The Disclosing Party shall be entitled, in addition to any other remedies available at law or equity, to seek **injunctive relief** and **specific performance** in any court of competent jurisdiction in the Philippines, without the necessity of posting a bond.

---

## 12. Non-Solicitation

For the duration of this Agreement and for **twelve (12) months** after its termination, neither Party shall directly or indirectly:

a. Solicit for employment or engagement any employee, officer, contractor, or board member of the other Party who became known to it through this engagement, without the other Party's prior written consent.
b. Encourage any such person to terminate their relationship with the other Party.

Mere general advertising not targeted at such persons is not a breach of this Section.

---

## 13. Independent Contractor

The Developer is an independent contractor. Nothing in this Agreement creates an employment, partnership, joint venture, or agency relationship between the Parties. Neither Party may bind the other to any obligation without the other's prior written authorisation.

---

## 14. Governing Law & Venue

This Agreement shall be governed by and construed in accordance with the laws of the **Republic of the Philippines**, without regard to its conflict-of-laws provisions.

Any dispute arising out of or relating to this Agreement shall be brought exclusively in the courts of **Cebu City, Philippines**, and each Party irrevocably submits to the personal jurisdiction of such courts.

---

## 15. Miscellaneous

a. **Entire Agreement.** This Agreement together with the Client Proposal and any service agreement constitutes the entire agreement between the Parties regarding its subject matter, superseding all prior oral or written understandings.

b. **Amendments.** Any modification must be in writing and signed by both Parties.

c. **Severability.** If any provision is held unenforceable, the remaining provisions remain in full effect, and the unenforceable provision shall be modified to the extent necessary to make it enforceable while preserving its intent.

d. **No Waiver.** A Party's failure to enforce any right is not a waiver of that right.

e. **Assignment.** Neither Party may assign this Agreement without the other's prior written consent, except that the Cooperative may assign to a successor entity in the event of merger, consolidation, or transfer of substantially all its assets.

f. **Counterparts.** This Agreement may be executed in counterparts (including electronic signatures), each of which is an original and all of which together constitute one instrument.

g. **Notices.** Notices shall be in writing and delivered by email to the contacts listed in the Parties' particulars above, or by registered mail to the addresses above. Notices are deemed received on the next business day after the sender's email server records successful delivery, or three (3) business days after posting by registered mail.

---

## 16. Signatures

IN WITNESS WHEREOF, the Parties have executed this Mutual Non-Disclosure Agreement on the Effective Date.

**FOR THE DEVELOPER**

Signature: _____________________________________

Printed name: Gerald Durano

Title: Independent Software Developer

Date: _____________________________________

**FOR THE COOPERATIVE — POWASSCO Multipurpose Cooperative**

Signature: _____________________________________

Printed name: _________________________________

Title: _________________________________________

Date: _____________________________________

**WITNESSES**

1. Signature: ____________________  Printed name: ____________________  Date: ____________

2. Signature: ____________________  Printed name: ____________________  Date: ____________

---

> *This template is provided for convenience. Both Parties are encouraged to have it reviewed by independent legal counsel before signing. Once signed, store a scanned copy with each Party's records.*
