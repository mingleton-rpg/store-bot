# Bruh United (store bot)
The source code for @zaccomode's store bot. The store would randomly-generate 5 items of different types periodically, allowing users to purchase them in exchange for their Dollars. 

## Item generation
- Items are defined in the [item.json](./json/items.json) file, and each have stat constraints.
- The `stats` object list provides "pseudo-stats" for the object. They have no practical use, but are used to give each item a unique value
