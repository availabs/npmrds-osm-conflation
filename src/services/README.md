# Services

## Decisions, Rationals, and Concerns

### Database Destroy Functions

The destroy functions allow clearing a LevelDB database before loading.
This simplifies loading by allowing the clear/load sequence to happen
  within a single process.

However, the destroy functions add a lot of complexity to the services.
They introduce race conditions and require making some calls asyncronous
  that otherwise could be synchronous.
Currently, not all race conditions are handled.
Handling them would only add more code complexity.

I remain unconvinced that the benefits outweigh the costs.
The more I consider this problem, the more dissatisfied I become
with the destroy functions and their effects on the code base.

The alternative to including the destroy functions would be
  forcing dataloading to happen as a sequence of processes.

1. rm -rf the respective LevelDb database directory
2. load the data into the empty database.

Because the clear/load sequence becomes uncoupled,
  it opens the possibility of quiet data corruption.
  This data corruption could lead to conflation output
    anomalies that would be extremely difficult to diagnose.

A possible safeguard against loading a dirty database
  would be an assertDbWasEmptyOnProcessStart call that
  simply checks for the existence of a LevelDb directory.
  This can be done synchronously with _fs.existsSync_.
  If the LevelDb directory exists,

  * the assert fails,
  * an error is thrown,
  * and the loader process exits.

The _assertDbWasEmptyOnProcessStart_ function call could become
a default part of the functions that put new features into a database.
A _"initalLoad"_ flag that defaults to _true_
could be added to the _leveDbService.putFeatures_ functions.
This is still hacky, but a lot of race conditions would be removed.
Different function names could make things a bit cleaner.
