
[Modeling one-to-many in SQlite using the JSON1 extension](http://blog.benjamin-encz.de/post/sqlite-one-to-many-json1-extension/)


```
\d test
+-----+------+------+---------+------------+----+
| cid | name | type | notnull | dflt_value | pk |
+-----+------+------+---------+------------+----+
| 0   | id   | INT  | 1       | <null>     | 1  |
| 1   | arr  | TEXT | 0       | <null>     | 0  |
+-----+------+------+---------+------------+----+

select * from test;
+----+---------+
| id | arr     |
+----+---------+
| 1  | [1,2,3] |
| 2  | [4,5,6] |
+----+---------+

select * from test, json_each(test.arr) ;
+----+---------+-----+-------+---------+------+----+--------+---------+------+
| id | arr     | key | value | type    | atom | id | parent | fullkey | path |
+----+---------+-----+-------+---------+------+----+--------+---------+------+
| 1  | [1,2,3] | 0   | 1     | integer | 1    | 1  | <null> | $[0]    | $    |
| 1  | [1,2,3] | 1   | 2     | integer | 2    | 2  | <null> | $[1]    | $    |
| 1  | [1,2,3] | 2   | 3     | integer | 3    | 3  | <null> | $[2]    | $    |
| 2  | [4,5,6] | 0   | 4     | integer | 4    | 1  | <null> | $[0]    | $    |
| 2  | [4,5,6] | 1   | 5     | integer | 5    | 2  | <null> | $[1]    | $    |
| 2  | [4,5,6] | 2   | 6     | integer | 6    | 3  | <null> | $[2]    | $    |
+----+---------+-----+-------+---------+------+----+--------+---------+------+
```
