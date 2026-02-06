import "reflect-metadata";
import { Model, getModel, XML } from "xml-model";

@Model()
export class MyClass {
  foo = "bar";
}

const x = new MyClass();

console.log(XML.stringify(getModel(MyClass).toXML(x)));
