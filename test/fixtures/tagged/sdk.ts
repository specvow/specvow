export type CreateInvoice = {
  amount: number;
};

export class Invoices {
  /** @operation createInvoice */
  add(body: CreateInvoice): Promise<{ id: string }> {
    return Promise.resolve({ id: "in_1" });
  }
}

export class Client {
  invoices = new Invoices();
}
