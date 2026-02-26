import "fake-indexeddb/auto";

if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock-url";
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => undefined;
}
