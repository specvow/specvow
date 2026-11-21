export class Pets {
  create(body: { name: string }): Promise<{ id: string }> {
    return Promise.resolve({ id: "1" });
  }
}

export class Client {
  get(path: string): Promise<unknown> {
    return Promise.resolve(path);
  }

  #hidden(): void {}

  pets = new Pets();
}
