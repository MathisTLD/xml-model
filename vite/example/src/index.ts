import "reflect-metadata"; // needed by typescript-rtti
import { Model } from "xml-model";

@Model({
  fromXML(ctx) {
    const instance = new MyClass();
    if (ctx.properties.foo) instance.foo = ctx.properties.foo;
    return instance;
  },
})
export class MyClass {
  foo = "bar";
}
