import { TransferForm } from "./BankAccounts";
import Feed from "./Feed";

// Contra: money moved between your own accounts (cash and banks) as a page of its own. One account goes down,
// the other goes up, and your total does not change. Past contras are listed under the form; tap one to change it.
export default function Contra() {
  return (
    <div className="space-y-5 max-w-3xl">
      <TransferForm />
      <Feed defaultFilter="transfer" title="Contra entries" />
    </div>
  );
}
