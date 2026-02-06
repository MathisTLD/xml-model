import { getModel, XML } from "xml-model";

import { MyClass } from ".";

const model = getModel(MyClass);

const a: MyClass = model.fromXML("<my-class><foo>test</foo></my-class>");
console.log(JSON.stringify(a)); // {"foo":"test"}

const b = new MyClass();
console.log(XML.stringify(model.toXML(b))); // <my-class><foo>bar</foo></my-class>
b.foo = "other";
console.log(XML.stringify(model.toXML(b))); // <my-class><foo>other</foo></my-class>
