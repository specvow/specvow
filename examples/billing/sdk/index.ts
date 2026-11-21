export type Invoice = {
  id: string;
};

export type CreateInvoice = {
  amount: number;
  currency?: string;
};

export type ListInvoices = {
  status?: string;
};

export class Invoices {
  create(body: CreateInvoice): Promise<Invoice> {
    return Promise.resolve({ id: "in_1" });
  }

  list(query?: ListInvoices): Promise<Invoice[]> {
    return Promise.resolve([]);
  }

  get(id: string): Promise<Invoice> {
    return Promise.resolve({ id });
  }
}

export class Billing {
  invoices = new Invoices();
}

export class Client {
  billing = new Billing();
}
