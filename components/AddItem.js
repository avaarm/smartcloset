// components/ AddItem.js
import React, {useState} from 'react';
import {View, Button, Image, Text} from 'react-native';
import { launchImageLibrary, launchImagelibrary} from 'react-native-image-picker';

const AddItem = () => {
    const [photo, setPhoto] = useState[null];

    const handleChoosePhoto = () => {
        launchImageLibrary({}, response => {
            if (response.assets && response.assets.length >0) {
                setPhoto(response.assets[0]);
            }
        });
    };

    return (
        <View style={{ flex:1, justifyContent: 'center', alignItems: 'center'}}>
            <Button title='Choose Photo' onPress={handleChoosePhoto}/>
            {photo && (
                <> 
                <Image 
                source={{ uri:photo.uri}}
                style={{ width:200, height: 200, marginTop: 10}}
                />
                <Text>{photo.fileName}</Text>
                </>
            )}
        </View>

    )
}

export default AddItem;