import qrcodeGenerator from 'qrcode-generator';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  value: string;
  size?: number;
  testID?: string;
};

export function QrCode({ value, size = 220, testID }: Props) {
  const grid = useMemo(() => {
    const qr = qrcodeGenerator(0, 'M');
    qr.addData(value);
    qr.make();

    const count = qr.getModuleCount();
    const rows: boolean[][] = [];
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      const row: boolean[] = [];
      for (let colIndex = 0; colIndex < count; colIndex += 1) {
        row.push(qr.isDark(rowIndex, colIndex));
      }
      rows.push(row);
    }
    return rows;
  }, [value]);

  const count = grid.length;
  const cell = count > 0 ? Math.floor(size / count) : 0;
  const quiet = cell * 2;

  return (
    <View testID={testID} style={[styles.wrap, { padding: quiet }]}>
      {grid.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((on, colIndex) => (
            <View
              key={colIndex}
              style={{
                width: cell,
                height: cell,
                backgroundColor: on ? '#000000' : '#FFFFFF',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
  },
});
